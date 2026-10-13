const { handler, send, httpError, rateLimit } = require('../_lib/http');
const { getAdmin } = require('../_lib/firebase');
const U = require('../_lib/usernames');

module.exports = handler(['POST'], async (req, res) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw httpError(401, 'Missing bearer token');
  let decoded;
  try {
    decoded = await getAdmin().auth().verifyIdToken(match[1], true);
  } catch (e) {
    throw httpError(401, 'Invalid or expired token');
  }
  rateLimit(`register:${decoded.uid}`, 5, 10 * 60 * 1000);

  const username = U.validate(req.body && req.body.username);
  if (String(decoded.email || '').toLowerCase() !== U.toEmail(username)) {
    throw httpError(403, 'Username does not match the signed-in account');
  }

  let displayName = String((req.body && req.body.displayName) || '').trim() || username;
  if (displayName.length < 2 || displayName.length > 30 || !/^[\w\s\-'.!?]+$/u.test(displayName)) {
    displayName = username.slice(0, 30);
  }

  const ref = getAdmin().database().ref(`users/${decoded.uid}`);
  const existing = await ref.once('value');
  if (existing.exists()) throw httpError(409, 'Profile already exists');

  const now = Date.now();
  await ref.set({
    displayName,
    username,
    joinDate: new Date(now).toISOString().split('T')[0],
    createdAt: now
  });
  send(res, 200, { ok: true, user: { displayName, username, joinDate: new Date(now).toISOString().split('T')[0], createdAt: now } });
});
