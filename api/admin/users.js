const { handler, send, httpError } = require('../_lib/http');
const { requireAdminSession } = require('../_lib/auth');
const { getAdmin } = require('../_lib/firebase');

function joinKey(jd) {
  if (typeof jd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(jd)) return jd.slice(0, 10);
  if (typeof jd === 'number' && jd > 0) return new Date(jd).toISOString().slice(0, 10);
  return null;
}

module.exports = handler(['GET'], async (req, res) => {
  await requireAdminSession(req);
  const view = (req.query && req.query.view) || 'search';
  const snap = await getAdmin().database().ref('users').once('value');

  if (view === 'search') {
    const users = [];
    snap.forEach((child) => {
      const d = child.val() || {};
      if (!d.username) return;
      users.push({
        uid: child.key,
        data: { username: d.username, displayName: d.displayName || d.display_name || '' }
      });
    });
    return send(res, 200, { users });
  }

  if (view === 'analytics') {
    const joinsByDay = {};
    const secondsByDay = {};
    let totalCoins = 0;
    let totalUsers = 0;
    snap.forEach((child) => {
      const u = child.val();
      if (!u) return;
      totalUsers += 1;
      const jk = joinKey(u.joinDate);
      if (jk) joinsByDay[jk] = (joinsByDay[jk] || 0) + 1;
      const so = u.analytics && u.analytics.secondsOnline;
      if (so && typeof so === 'object') {
        for (const [day, secs] of Object.entries(so)) {
          if (typeof secs === 'number') secondsByDay[day] = (secondsByDay[day] || 0) + secs;
        }
      }
      const tc = u.playerState && u.playerState.stats && u.playerState.stats.totalCoinsEarned;
      if (typeof tc === 'number') totalCoins += tc;
    });
    return send(res, 200, { joinsByDay, secondsByDay, totalCoins, totalUsers });
  }

  throw httpError(400, 'Unknown view');
});