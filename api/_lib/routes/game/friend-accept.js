const { handler, send, httpError, rateLimit } = require('../../http');
const { requireUser } = require('../../auth');
const { db, txn, UID_RE, userExists } = require('../../gateway');
const { toArr } = require('../../guard');

function meta(uid, user, ps) {
  const u = user || {};
  const p = ps || {};
  return {
    userId: uid,
    username: u.username || '',
    displayName: u.displayName || u.username || '',
    level: Number(p.level || 1),
    avatarSrc: p.equippedIdolKey ? `./imgs/${p.equippedIdolKey}/1.jpg` : './imgs/assets/default_avatar.png',
    totalLoveLevel: 0,
    spotlightLevel: Number(p.spotlightLevel || 0),
    snakeventeenLevel: Number(p.snakeventeenLevel || 0)
  };
}

async function addToList(owner, entry) {
  const r = await txn(`users/${owner}/playerState/friends/list`, (cur) => {
    const list = toArr(cur).filter((f) => f && f.userId !== entry.userId);
    if (list.length >= 300) throw httpError(400, 'Friend list is full');
    list.push(entry);
    return list;
  });
  return toArr(r.value);
}

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireUser(req);
  const me = decoded.uid;
  rateLimit(`faccept:${me}`, 30, 10 * 60 * 1000);
  const reqId = req.body && req.body.reqId;
  if (typeof reqId !== 'string' || !/^[A-Za-z0-9_\-]{1,120}$/.test(reqId)) throw httpError(400, 'Invalid request id');

  const reqRef = db().ref(`users/${me}/friendRequests/incoming/${reqId}`);
  const request = (await reqRef.once('value')).val();
  if (!request || request.toUserId !== me) throw httpError(404, 'Request not found');
  const other = request.fromUserId;
  if (!UID_RE.test(other || '') || other === me) throw httpError(400, 'Invalid request');

  const [meSnap, otherSnap] = await Promise.all([
    db().ref(`users/${me}`).once('value'),
    db().ref(`users/${other}`).once('value')
  ]);
  if (!otherSnap.exists() || !(await userExists(other))) {
    await reqRef.remove();
    throw httpError(404, 'User no longer exists');
  }
  const meUser = meSnap.val() || {};
  const otherUser = otherSnap.val() || {};
  const myMeta = meta(me, meUser, meUser.playerState);
  const otherMeta = meta(other, otherUser, otherUser.playerState);

  const myList = await addToList(me, otherMeta);
  await addToList(other, myMeta);
  if (!(await userExists(other))) {
    await txn(`users/${me}/playerState/friends/list`, (cur) => {
      const list = toArr(cur).filter((f) => f && f.userId !== other);
      return list.length ? list : null;
    });
    await db().ref(`users/${other}/playerState/friends/list`).remove().catch(() => {});
    await reqRef.remove();
    throw httpError(404, 'User no longer exists');
  }

  await Promise.all([
    reqRef.remove(),
    db().ref(`users/${other}/friendRequests/outgoing/${reqId}`).remove()
  ]);

  const [incoming, outgoing] = await Promise.all([
    db().ref(`users/${me}/friendRequests/incoming`).once('value'),
    db().ref(`users/${me}/friendRequests/outgoing`).once('value')
  ]);
  const cleanup = [];
  [incoming, outgoing].forEach((snap, i) => {
    const dir = i === 0 ? 'incoming' : 'outgoing';
    snap.forEach((child) => {
      const r = child.val() || {};
      if ((r.fromUserId === other && r.toUserId === me) || (r.fromUserId === me && r.toUserId === other)) {
        cleanup.push(db().ref(`users/${me}/friendRequests/${dir}/${child.key}`).remove());
        cleanup.push(db().ref(`users/${other}/friendRequests/${dir === 'incoming' ? 'outgoing' : 'incoming'}/${child.key}`).remove());
      }
    });
  });
  await Promise.all(cleanup);

  send(res, 200, { ok: true, list: myList, friend: otherMeta });
});