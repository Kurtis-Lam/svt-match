// File: api/_lib/routes/admin/users.js
const { handler, send, httpError } = require('../../http');
const { requireAdminSession } = require('../../auth');
const { getAdmin } = require('../../firebase');

function joinKey(jd) {
  if (typeof jd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(jd)) return jd.slice(0, 10);
  if (typeof jd === 'number' && jd > 0) return new Date(jd).toISOString().slice(0, 10);
  return null;
}

function listOf(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (v && typeof v === 'object') return Object.values(v).filter(Boolean);
  return [];
}

module.exports = handler(['GET'], async (req, res) => {
  await requireAdminSession(req);
  const view = (req.query && req.query.view) || 'search';
  const db = getAdmin().database();

  if (view === 'earnings') {
    const uid = req.query && typeof req.query.uid === 'string' ? req.query.uid : '';
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
    const [earningSnap, changeSnap, logSnap] = await Promise.all([
      db.ref(`adminPlayerHistory/${uid}/earningsHistory`).orderByChild('at').limitToLast(300).once('value'),
      db.ref(`adminPlayerHistory/${uid}/adminChangeHistory`).orderByChild('at').limitToLast(500).once('value'),
      db.ref('adminLogs').orderByChild('at').limitToLast(500).once('value')
    ]);
    const earnings = [];
    earningSnap.forEach(child => earnings.push({ id: child.key, ...(child.val() || {}) }));
    earnings.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    const changes = [];
    const knownChangeTimes = new Set();
    changeSnap.forEach(child => {
      const entry = { id: child.key, ...(child.val() || {}) };
      changes.push(entry);
      knownChangeTimes.add(`${entry.action || ''}:${Number(entry.at) || 0}`);
    });
    // Include legacy raw edits from the global log, while using the durable per-player
    // history for normal structured edits so records do not disappear as global logs grow.
    logSnap.forEach(child => {
      const entry = child.val() || {};
      if (!entry.detail || entry.detail.uid !== uid || !String(entry.action || '').startsWith('raw-')) return;
      const signature = `${entry.action || ''}:${Number(entry.at) || 0}`;
      if (knownChangeTimes.has(signature)) return;
      changes.push({ id: child.key, ...entry });
    });
    changes.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    return send(res, 200, { earnings, changes });
  }

  if (view === 'logs') {
    const snap = await db.ref('adminLogs').orderByChild('at').limitToLast(100).once('value');
    const logs = [];
    snap.forEach((child) => {
      logs.push(child.val() || {});
    });
    logs.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    return send(res, 200, { logs });
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

  if (view === 'list' || view === 'flags') {
    const guardSnap = await db.ref('guard').once('value');
    const guards = guardSnap.val() || {};
    if (view === 'list') {
      const players = [];
      snap.forEach((child) => {
        const u = child.val() || {};
        if (!u.username) return;
        const ps = u.playerState || {};
        const stats = ps.stats || {};
        const g = guards[child.key] || {};
        players.push({
          uid: child.key,
          username: u.username,
          displayName: u.displayName || '',
          level: Number(ps.level) || 0,
          spotlightLevel: Number(ps.spotlightLevel) || 0,
          snakeventeenLevel: Number(ps.snakeventeenLevel) || 0,
          coins: Number(ps.coins) || 0,
          totalCoinsEarned: Number(stats.totalCoinsEarned) || 0,
          battleWins: Number(stats.battleWins) || 0,
          battleLosses: Number(stats.battleLosses) || 0,
          friends: listOf(ps.friends && ps.friends.list).length,
          lastSeenAt: Number(u.analytics && u.analytics.lastSeenAt) || 0,
          strikes: Number(g.strikes) || 0,
          banned: !!g.banned
        });
      });
      return send(res, 200, { players });
    }
    const rows = [];
    for (const uid of Object.keys(guards)) {
      const g = guards[uid] || {};
      if (!(Number(g.strikes) > 0) && !g.banned) continue;
      const u = (snap.child(uid).val() || {});
      rows.push({
        uid,
        username: u.username || '',
        strikes: Number(g.strikes) || 0,
        banned: !!g.banned,
        lastFlagAt: Number(g.lastFlagAt) || 0,
        flags: listOf(g.flags).slice(-25)
      });
    }
    rows.sort((a, b) => b.lastFlagAt - a.lastFlagAt);
    return send(res, 200, { rows });
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