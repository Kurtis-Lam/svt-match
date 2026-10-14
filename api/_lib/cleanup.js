const { getAdmin } = require('./firebase');
const { toArr } = require('./guard');

async function removeUserEverywhere(uid) {
  const db = getAdmin().database();
  const [snap, seasonsSnap] = await Promise.all([
    db.ref('users').once('value'),
    db.ref('seasons').once('value')
  ]);
  const updates = {};
  let touched = 0;
  snap.forEach((child) => {
    const other = child.key;
    if (other === uid) return;
    const u = child.val() || {};
    const ps = u.playerState || {};
    const friends = ps.friends || {};
    const battles = ps.battles || {};
    const dropFriend = (f) => f && f.userId === uid;
    const dropReq = (r) => r && (r.fromUserId === uid || r.toUserId === uid);
    const filterField = (path, value, drop) => {
      if (value === undefined || value === null) return;
      const arr = toArr(value);
      const next = arr.filter((x) => !drop(x));
      if (next.length !== arr.length) {
        updates[`users/${other}/playerState/${path}`] = next.length ? next : null;
        touched++;
      }
    };
    filterField('friends/list', friends.list, dropFriend);
    filterField('friends/incoming', friends.incoming, dropReq);
    filterField('friends/outgoing', friends.outgoing, dropReq);
    filterField('battles/pendingIncoming', battles.pendingIncoming, dropReq);
    filterField('battles/pendingOutgoing', battles.pendingOutgoing, dropReq);
    ['incoming', 'outgoing'].forEach((dir) => {
      const reqs = (u.friendRequests && u.friendRequests[dir]) || {};
      Object.keys(reqs).forEach((id) => {
        if (dropReq(reqs[id])) {
          updates[`users/${other}/friendRequests/${dir}/${id}`] = null;
          touched++;
        }
      });
    });
  });
  // Also remove this user's entries from every season leaderboard.
  seasonsSnap.forEach((season) => {
    updates[`seasons/${season.key}/${uid}`] = null;
  });
  updates[`users/${uid}`] = null;
  updates[`guard/${uid}`] = null;
  await db.ref().update(updates);
  return { cleaned: touched };
}

module.exports = { removeUserEverywhere };
