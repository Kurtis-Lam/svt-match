const { handler, send, httpError, rateLimit } = require('../../http');
const { requireUser } = require('../../auth');
const { getAdmin } = require('../../firebase');
const { removeUserEverywhere } = require('../../cleanup');

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireUser(req);
  rateLimit(`delete-account:${decoded.uid}`, 3, 60 * 60 * 1000);

  if (!req.body || req.body.confirm !== true) {
    throw httpError(400, 'Confirmation required');
  }

  // Require a recent authentication event. The client re-authenticates with the
  // account password immediately before calling this endpoint.
  const authTime = Number(decoded.auth_time || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authTime || now - authTime > 5 * 60 || authTime > now + 30) {
    throw httpError(401, 'Recent sign-in required. Please enter your password again.');
  }

  const admin = getAdmin();
  // Perform cross-user cleanup with the Admin SDK. The client must not be able
  // to bypass normal game-write restrictions to edit other players' records.
  await removeUserEverywhere(decoded.uid);

  // Database cleanup happens first. Treat a missing Auth user as already deleted
  // so a retry can safely finish after a partial failure.
  try {
    await admin.auth().deleteUser(decoded.uid);
  } catch (e) {
    if (!(e && e.code === 'auth/user-not-found')) throw e;
  }

  send(res, 200, { ok: true });
});
