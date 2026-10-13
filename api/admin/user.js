const { handler, send, httpError, rateLimit } = require('../_lib/http');
const { requireAdminSession } = require('../_lib/auth');
const { getAdmin } = require('../_lib/firebase');

module.exports = handler(['GET'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`user:${decoded.uid}`, 120, 10 * 60 * 1000);
  const uid = req.query && typeof req.query.uid === 'string' ? req.query.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
  const fb = getAdmin();
  const [userSnap, guardSnap] = await Promise.all([
    fb.database().ref(`users/${uid}`).once('value'),
    fb.database().ref(`guard/${uid}`).once('value')
  ]);
  if (!userSnap.exists()) throw httpError(404, 'User not found');
  const user = userSnap.val() || {};
  const hasLegacyPassword = typeof user.password === 'string' && user.password.length > 0;
  delete user.password;

  let account = null;
  try {
    const a = await fb.auth().getUser(uid);
    account = {
      email: a.email || null,
      disabled: !!a.disabled,
      createdAt: a.metadata.creationTime || null,
      lastSignInAt: a.metadata.lastSignInTime || null,
      lastRefreshAt: a.metadata.lastRefreshTime || null
    };
  } catch (e) {
    account = null;
  }

  const g = guardSnap.val() || {};
  const flags = Array.isArray(g.flags) ? g.flags : Object.values(g.flags || {});
  send(res, 200, {
    uid,
    user,
    hasLegacyPassword,
    account,
    guard: {
      strikes: Number(g.strikes) || 0,
      banned: g.banned || null,
      lastFlagAt: Number(g.lastFlagAt) || 0,
      flags: flags.slice(-25),
      window: g.w || null
    }
  });
});
