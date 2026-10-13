const { handler, send, httpError, rateLimit } = require('../_lib/http');
const { requireUser } = require('../_lib/auth');
const { getAdmin } = require('../_lib/firebase');
const U = require('../_lib/usernames');

module.exports = handler(['GET'], async (req, res) => {
  const decoded = await requireUser(req);
  rateLimit(`find:${decoded.uid}`, 60, 10 * 60 * 1000);
  const name = U.normalize(req.query && req.query.u);
  if (!name) throw httpError(400, 'Missing username');
  const authUser = await U.findAuthByUsername(name);
  if (!authUser) return send(res, 200, { found: false });
  const snap = await getAdmin().database().ref(`users/${authUser.uid}`).once('value');
  if (!snap.exists()) return send(res, 200, { found: false });
  const u = snap.val() || {};
  send(res, 200, {
    found: true,
    user: {
      id: authUser.uid,
      username: u.username || name,
      displayName: u.displayName || u.username || name,
      joinDate: u.joinDate || null
    }
  });
});
