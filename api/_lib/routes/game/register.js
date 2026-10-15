// File: api/_lib/routes/game/register.js
const { handler, send, httpError, rateLimit } = require('../../http');
const { getAdmin } = require('../../firebase');
const U = require('../../usernames');

module.exports = handler(['POST'], async (req, res) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw httpError(401, 'Missing bearer token');
  let decoded;
  try {
    decoded = await getAdmin().auth().verifyIdToken(match[1], false);
  } catch (e) {
    console.error('[register] verifyIdToken failed:', e && e.code, e && e.message);
    throw httpError(401, 'Invalid or expired token');
  }
  rateLimit(`register:${decoded.uid}`, 5, 10 * 60 * 1000);

  const username = U.validate(req.body && req.body.username);
  if (String(decoded.email || '').toLowerCase() !== U.toEmail(username)) {
    throw httpError(403, 'Username does not match the signed-in account');
  }

  let displayName = String((req.body && req.body.displayName) || '').trim() || username;
  if (displayName.length < 2 || displayName.length > 30 || !/^[\p{L}\p{N}\p{M}\s_\-'.!?]+$/u.test(displayName)) {
    displayName = username.slice(0, 30);
  }

  if (!decoded.firebase || decoded.firebase.sign_in_provider !== 'password') {
    throw httpError(403, 'Unsupported sign-in method');
  }

  const db = getAdmin().database();
  const guardSnap = await db.ref(`guard/${decoded.uid}`).once('value');
  const g = guardSnap.val() || {};
  if (g.banned || g.deleting) throw httpError(403, 'This account cannot be registered');

  const now = Date.now();
  const joinDate = new Date(now).toISOString().split('T')[0];
  const profile = { displayName, username, joinDate, createdAt: now };
  const tx = await db.ref(`users/${decoded.uid}`).transaction((cur) => (cur === null ? profile : undefined), undefined, false);
  if (!tx.committed) throw httpError(409, 'Profile already exists');
  send(res, 200, { ok: true, user: profile });
});