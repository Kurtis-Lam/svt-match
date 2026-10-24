const { handler, send, httpError, rateLimit } = require('../../http');
const { requireAdminSession, auditLog } = require('../../auth');
const { getAdmin } = require('../../firebase');

const FIELDS = {
  coins: { path: 'playerState/coins', int: true, min: 0, max: 1e9 },
  level: { path: 'playerState/level', int: true, min: 0, max: 100000 },
  streak: { path: 'playerState/streak', int: true, min: 0, max: 100000 },
  bestTimeSec: { path: 'playerState/bestTimeSec', int: false, min: 0, max: 1e6 },
  spotlightLevel: { path: 'playerState/spotlightLevel', int: true, min: 0, max: 100000 },
  spotlightStreak: { path: 'playerState/spotlightStreak', int: true, min: 0, max: 100000 },
  spotlightBestCorrect: { path: 'playerState/spotlightBestCorrect', int: true, min: 0, max: 100000 },
  snakeventeenLevel: { path: 'playerState/snakeventeenLevel', int: true, min: 0, max: 100000 },
  snakeventeenStreak: { path: 'playerState/snakeventeenStreak', int: true, min: 0, max: 100000 },
  snakeventeenLongestLength: { path: 'playerState/snakeventeenLongestLength', int: true, min: 0, max: 100000 },
  rings: { path: 'playerState/rings', int: true, min: 0, max: 1e9 },
  'stats.totalCoinsEarned': { path: 'playerState/stats/totalCoinsEarned', int: true, min: 0, max: 1e12 },
  'stats.battleWins': { path: 'playerState/stats/battleWins', int: true, min: 0, max: 1e9 },
  'stats.battleLosses': { path: 'playerState/stats/battleLosses', int: true, min: 0, max: 1e9 },
  'stats.levelsCompleted': { path: 'playerState/stats/levelsCompleted', int: true, min: 0, max: 1e9 },
  displayName: { path: 'displayName', string: true, maxLength: 30 }
};

function pathValue(root, path) {
  return path.split('/').reduce((cur, key) => cur && cur[key] !== undefined ? cur[key] : undefined, root);
}

function same(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`update:${decoded.uid}`, 60, 10 * 60 * 1000);

  const body = req.body || {};
  const uid = typeof body.uid === 'string' ? body.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
  if (!body.updates || typeof body.updates !== 'object' || Array.isArray(body.updates)) throw httpError(400, 'Missing updates');

  const clean = {};
  const patch = {};
  for (const [key, value] of Object.entries(body.updates)) {
    const rule = FIELDS[key];
    if (!rule) throw httpError(400, `Field not editable: ${key}`);
    if (rule.string) {
      if (typeof value !== 'string') throw httpError(400, `Invalid value for ${key}`);
      clean[key] = value.trim().slice(0, rule.maxLength);
    } else {
      const n = Number(value);
      if (!Number.isFinite(n)) throw httpError(400, `Invalid number for ${key}`);
      clean[key] = Math.min(rule.max, Math.max(rule.min, rule.int ? Math.trunc(n) : n));
    }
    patch[rule.path] = clean[key];
  }
  if (!Object.keys(clean).length) throw httpError(400, 'Nothing to update');

  const db = getAdmin().database();
  const userRef = db.ref(`users/${uid}`);
  const userSnap = await userRef.once('value');
  if (!userSnap.exists()) throw httpError(404, 'User not found');

  const changes = [];
  for (const [key, rule] of Object.entries(FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(clean, key)) continue;
    const from = pathValue(userSnap.val() || {}, rule.path);
    const to = clean[key];
    if (!same(from, to)) changes.push({ path: rule.path, from: from === undefined ? null : from, to });
  }
  if (changes.length) {
    await userRef.update(patch);
    const adminEmail = typeof decoded.email === 'string' ? decoded.email : null;
    const auditDetail = { uid, username: userSnap.child('username').val() || '', adminEmail, changes };
    await auditLog(decoded.uid, 'update-player', auditDetail);
    await db.ref(`adminPlayerHistory/${uid}/adminChangeHistory`).push().set({
      at: Date.now(),
      by: decoded.uid,
      action: 'update-player',
      detail: auditDetail
    }).catch((e) => console.error('[admin-change-history] player update failed:', e && e.message));
    for (const change of changes) {
      if (change.path !== 'playerState/coins') continue;
      const from = Number(change.from) || 0;
      const to = Number(change.to) || 0;
      await db.ref(`adminPlayerHistory/${uid}/earningsHistory`).push().set({
        at: Date.now(), type: 'admin_adjustment', source: 'admin', adminUid: decoded.uid,
        adminEmail, field: 'coins', amount: to - from, coinsBefore: from, coinsAfter: to, from, to
      }).catch((e) => console.error('[earnings-history] admin adjustment failed:', e && e.message));
    }
  }
  send(res, 200, { ok: true, updates: clean, changes });
});
