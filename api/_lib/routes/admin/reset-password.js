// File: api/_lib/routes/admin/reset-password.js
const crypto = require('crypto');
const { handler, send, httpError, rateLimit } = require('../../http');
const { requireAdminSession } = require('../../auth');
const { getAdmin } = require('../../firebase');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function tempPassword(len = 12) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`reset:${decoded.uid}`, 20, 10 * 60 * 1000);

  const uid = req.body && typeof req.body.uid === 'string' ? req.body.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');

  const fb = getAdmin();
  try {
    await fb.auth().getUser(uid);
  } catch (e) {
    throw httpError(404, 'User not found in Firebase Authentication');
  }

  const password = tempPassword();
  await fb.auth().updateUser(uid, { password });
  await fb.auth().revokeRefreshTokens(uid);
  await fb.database().ref(`users/${uid}/password`).remove().catch(() => {});

  send(res, 200, { ok: true, password });
});