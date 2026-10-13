const { handler, send, httpError, rateLimit } = require('../_lib/http');
const { requireUser } = require('../_lib/auth');
const U = require('../_lib/usernames');

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireUser(req);
  rateLimit(`rename:${decoded.uid}`, 5, 60 * 60 * 1000);
  const authTime = Number(decoded.auth_time || 0) * 1000;
  if (!authTime || Date.now() - authTime > 10 * 60 * 1000) throw httpError(401, 'Please re-enter your password and try again');
  const out = await U.renameUser(decoded.uid, req.body && req.body.username);
  send(res, 200, { ok: true, username: out.username });
});
