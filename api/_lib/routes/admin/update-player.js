const { handler, send, httpError, rateLimit } = require('../../http');
const { requireAdminSession, auditLog } = require('../../auth');
const { getAdmin } = require('../../firebase');

const FIELDS = {
  coins: { int: true, min: 0, max: 1e9 },
  level: { int: true, min: 0, max: 100000 },
  streak: { int: true, min: 0, max: 100000 },
  bestTimeSec: { int: false, min: 0, max: 1e6 },
  spotlightLevel: { int: true, min: 0, max: 100000 },
  spotlightStreak: { int: true, min: 0, max: 100000 },
  spotlightBestCorrect: { int: true, min: 0, max: 100000 },
  snakeventeenLevel: { int: true, min: 0, max: 100000 },
  snakeventeenStreak: { int: true, min: 0, max: 100000 },
  snakeventeenLongestLength: { int: true, min: 0, max: 100000 },
  rings: { int: true, min: 0, max: 1e6 },
  'stats.totalCoinsEarned': { int: true, min: 0, max: 1e12 },
  'stats.battleWins': { int: true, min: 0, max: 1e7 },
  'stats.battleLosses': { int: true, min: 0, max: 1e7 },
  'stats.levelsCompleted': { int: true, min: 0, max: 1e7 },
  'stats.kkumaHits': { int: true, min: 0, max: 1e7 }
};

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`update:${decoded.uid}`, 60, 10 * 60 * 1000);

  const body = req.body || {};
  const uid = typeof body.uid === 'string' ? body.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
  if (!body.updates || typeof body.updates !== 'object') throw httpError(400, 'Missing updates');

  const clean = {};
  let displayName = null;
  for (const [key, value] of Object.entries(body.updates)) {
    if (key === 'displayName') {
      const name = String(value || '').trim();
      if (name.length < 2 || name.length > 30 || !/^[\w\s\-'.!?]+$/u.test(name)) throw httpError(400, 'Invalid display name');
      displayName = name;
      continue;
    }
    const rule = FIELDS[key];
    if (!rule) throw httpError(400, `Field not editable: ${key}`);
    const n = Number(value);
    if (!Number.isFinite(n)) throw httpError(400, `Invalid number for ${key}`);
    clean[key] = Math.min(rule.max, Math.max(rule.min, rule.int ? Math.trunc(n) : n));
  }
  if (!Object.keys(clean).length && displayName === null) throw httpError(400, 'Nothing to update');

  const db = getAdmin().database();
  const exists = (await db.ref(`users/${uid}`).once('value')).exists();
  if (!exists) throw httpError(404, 'User not found');

  const updates = {};
  for (const [key, value] of Object.entries(clean)) updates[`users/${uid}/playerState/${key.replace(/\./g, '/')}`] = value;
  if (displayName !== null) {
    updates[`users/${uid}/displayName`] = displayName;
    const ps = await db.ref(`users/${uid}/playerState`).once('value');
    if (ps.exists()) updates[`users/${uid}/playerState/displayName`] = displayName;
  }
  await db.ref().update(updates);
  await auditLog(decoded.uid, 'update-player', { uid, updates: { ...clean, ...(displayName !== null ? { displayName } : {}) } });
  send(res, 200, { ok: true, updates: { ...clean, ...(displayName !== null ? { displayName } : {}) } });
});
