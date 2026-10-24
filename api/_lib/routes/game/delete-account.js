const { handler, send, httpError, rateLimit } = require('../../http');
const { requireUser } = require('../../auth');
const { deleteAccountCompletely } = require('../../cleanup');

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireUser(req, { allowDeleting: true });
  rateLimit(`delete-account:${decoded.uid}`, 5, 60 * 60 * 1000);

  if (!req.body || req.body.confirm !== true) {
    throw httpError(400, 'Confirmation required');
  }

  const authTime = Number(decoded.auth_time || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authTime || now - authTime > 5 * 60 || authTime > now + 30) {
    throw httpError(401, 'Recent sign-in required. Please enter your password again.');
  }

  await deleteAccountCompletely(decoded.uid);
  send(res, 200, { ok: true });
});