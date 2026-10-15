// File: api/_lib/routes/admin/update-player.js
const { handler, send, httpError, rateLimit } = require('../../http');
const { requireAdminSession } = require('../../auth');
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
  snakeventeenLongestLength: { int: true, min: 0, max: 100000 }
};

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`update:${decoded.uid}`, 60, 10 * 60 * 1000);

  const body = req.body || {};
  const uid = typeof body.uid === 'string' ? body.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
  if (!body.updates || typeof body.updates !== 'object') throw httpError(400, 'Missing updates');

  const clean = {};
  for (const [key, value] of Object.entries(body.updates)) {
    const rule = FIELDS[key];
    if (!rule) throw httpError(400, `Field not editable: ${key}`);
    const n = Number(value);
    if (!Number.isFinite(n)) throw httpError(400, `Invalid number for ${key}`);
    clean[key] = Math.min(rule.max, Math.max(rule.min, rule.int ? Math.trunc(n) : n));
  }
  if (!Object.keys(clean).length) throw httpError(400, 'Nothing to update');

  const ref = getAdmin().database().ref(`users/${uid}/playerState`);
  const exists = (await getAdmin().database().ref(`users/${uid}`).once('value')).exists();
  if (!exists) throw httpError(404, 'User not found');

  await ref.update(clean);
  send(res, 200, { ok: true, updates: clean });
});