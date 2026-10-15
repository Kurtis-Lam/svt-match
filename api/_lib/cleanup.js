const { getAdmin } = require('./firebase');
const { toArr } = require('./guard');

function refsUser(x, uid) {
  return !!x && (x.userId === uid || x.fromUserId === uid || x.toUserId === uid);
}

async function markDeleting(uid) {
  await getAdmin().database().ref(`guard/${uid}/deleting`).set(Date.now());
}

async function sweepOwnNodes(uid, keepGuard) {
  const db = getAdmin().database();
  const seasonsSnap = await db.ref('seasons').once('value');
  const updates = {};
  seasonsSnap.forEach((season) => {
    if (season.hasChild(uid)) updates[`seasons/${season.key}/${uid}`] = null;
  });
  updates[`users/${uid}`] = null;
  if (!keepGuard) updates[`guard/${uid}`] = null;
  await db.ref().update(updates);
}

async function removeReferencesToUser(uid) {
  const db = getAdmin().database();
  const snap = await db.ref('users').once('value');
  const updates = {};
  let touched = 0;
  snap.forEach((child) => {
    const other = child.key;
    if (other === uid) return;
    const u = child.val() || {};
    const ps = u.playerState || {};
    const friends = ps.friends || {};
    const battles = ps.battles || {};
    const filterField = (path, value) => {
      if (value === undefined || value === null) return;
      const arr = toArr(value);
      const next = arr.filter((x) => !refsUser(x, uid));
      if (next.length !== arr.length) {
        updates[`users/${other}/playerState/${path}`] = next.length ? next : null;
        touched++;
      }
    };
    filterField('friends/list', friends.list);
    filterField('friends/incoming', friends.incoming);
    filterField('friends/outgoing', friends.outgoing);
    filterField('battles/pendingIncoming', battles.pendingIncoming);
    filterField('battles/pendingOutgoing', battles.pendingOutgoing);
    ['incoming', 'outgoing'].forEach((dir) => {
      const reqs = (u.friendRequests && u.friendRequests[dir]) || {};
      Object.keys(reqs).forEach((id) => {
        if (refsUser(reqs[id], uid)) {
          updates[`users/${other}/friendRequests/${dir}/${id}`] = null;
          touched++;
        }
      });
    });
  });
  if (Object.keys(updates).length) await db.ref().update(updates);
  return touched;
}

async function removeUserEverywhere(uid) {
  await markDeleting(uid);
  const cleaned = await removeReferencesToUser(uid);
  await sweepOwnNodes(uid, false);
  return { cleaned };
}

async function deleteAccountCompletely(uid) {
  const admin = getAdmin();
  await markDeleting(uid);
  await admin.auth().revokeRefreshTokens(uid).catch(() => {});
  const cleaned = await removeReferencesToUser(uid);
  await sweepOwnNodes(uid, true);
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    if (!(e && e.code === 'auth/user-not-found')) throw e;
  }
  await sweepOwnNodes(uid, false);
  return { cleaned };
}

module.exports = { removeUserEverywhere, deleteAccountCompletely };