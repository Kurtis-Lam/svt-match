const { handler, send, httpError } = require('../../http');
const { requireAdminSession } = require('../../auth');
const { getAdmin } = require('../../firebase');

function joinKey(jd) {
  if (typeof jd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(jd)) return jd.slice(0, 10);
  if (typeof jd === 'number' && jd > 0) return new Date(jd).toISOString().slice(0, 10);
  return null;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

module.exports = handler(['GET'], async (req, res) => {
  await requireAdminSession(req);
  const view = (req.query && req.query.view) || 'search';
  const db = getAdmin().database();

  if (view === 'logs') {
    const snap = await db.ref('adminLogs').orderByKey().limitToLast(200).once('value');
    const logs = [];
    snap.forEach((c) => { logs.push({ id: c.key, ...(c.val() || {}) }); });
    logs.reverse();
    return send(res, 200, { logs });
  }

  if (view === 'flags') {
    const [guardSnap, usersSnap] = await Promise.all([db.ref('guard').once('value'), db.ref('users').once('value')]);
    const names = {};
    usersSnap.forEach((c) => { const u = c.val() || {}; names[c.key] = u.username || ''; });
    const rows = [];
    guardSnap.forEach((c) => {
      const g = c.val() || {};
      if (!g.strikes && !g.banned) return;
      const flags = Array.isArray(g.flags) ? g.flags : Object.values(g.flags || {});
      rows.push({
        uid: c.key,
        username: names[c.key] || '',
        strikes: n(g.strikes),
        banned: !!g.banned,
        lastFlagAt: n(g.lastFlagAt),
        flags: flags.slice(-10)
      });
    });
    rows.sort((a, b) => b.strikes - a.strikes);
    return send(res, 200, { rows });
  }

  const snap = await db.ref('users').once('value');

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

  if (view === 'list') {
    const guardSnap = await db.ref('guard').once('value');
    const guards = guardSnap.val() || {};
    const players = [];
    snap.forEach((child) => {
      const u = child.val() || {};
      const ps = u.playerState || {};
      const st = ps.stats || {};
      const g = guards[child.key] || {};
      const friends = ps.friends && ps.friends.list ? Object.keys(ps.friends.list).length : 0;
      players.push({
        uid: child.key,
        username: u.username || '',
        displayName: u.displayName || '',
        joinDate: u.joinDate || null,
        lastSeenAt: (u.analytics && u.analytics.lastSeenAt) || null,
        level: n(ps.level),
        spotlightLevel: n(ps.spotlightLevel),
        snakeventeenLevel: n(ps.snakeventeenLevel),
        coins: n(ps.coins),
        totalCoinsEarned: n(st.totalCoinsEarned),
        battleWins: n(st.battleWins),
        battleLosses: n(st.battleLosses),
        friends,
        strikes: n(g.strikes),
        banned: !!g.banned
      });
    });
    return send(res, 200, { players });
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
