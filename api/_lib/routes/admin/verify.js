const { handler, send, httpError, rateLimit } = require('../../http');
const { requireAdminAccount, issueSession, safeEqual } = require('../../auth');

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminAccount(req);
  rateLimit(`verify:${decoded.uid}`, 5, 10 * 60 * 1000);

  const expected = process.env.ADMIN_SHARED_PASSWORD;
  if (!expected) throw new Error('ADMIN_SHARED_PASSWORD is not set');

  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!password || !safeEqual(password, expected)) throw httpError(401, 'Incorrect admin password');

  const session = issueSession(decoded.uid);
  send(res, 200, { ok: true, sessionToken: session.token, expiresAt: session.expiresAt });
});