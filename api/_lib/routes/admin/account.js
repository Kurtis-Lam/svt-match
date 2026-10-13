const { handler, send, httpError, rateLimit } = require('../../http');
const { requireAdminSession, auditLog } = require('../../auth');
const { getAdmin } = require('../../firebase');
const U = require('../../usernames');
const { removeUserEverywhere } = require('../../cleanup');

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`account:${decoded.uid}`, 40, 10 * 60 * 1000);
  const body = req.body || {};
  const uid = typeof body.uid === 'string' ? body.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
  const action = body.action;
  const fb = getAdmin();
  const db = fb.database();
  if (action !== 'delete' && !(await db.ref(`users/${uid}`).once('value')).exists()) throw httpError(404, 'User not found');

  if (action === 'ban') {
    const reason = String(body.reason || '').slice(0, 200);
    await db.ref(`guard/${uid}/banned`).set({ at: Date.now(), by: decoded.uid, reason });
    try { await fb.auth().updateUser(uid, { disabled: true }); } catch (e) {}
    await fb.auth().revokeRefreshTokens(uid).catch(() => {});
    await auditLog(decoded.uid, 'ban', { uid, reason });
    return send(res, 200, { ok: true });
  }
  if (action === 'unban') {
    await db.ref(`guard/${uid}/banned`).remove();
    try { await fb.auth().updateUser(uid, { disabled: false }); } catch (e) {}
    await auditLog(decoded.uid, 'unban', { uid });
    return send(res, 200, { ok: true });
  }
  if (action === 'revoke') {
    await fb.auth().revokeRefreshTokens(uid);
    await auditLog(decoded.uid, 'revoke-sessions', { uid });
    return send(res, 200, { ok: true });
  }
  if (action === 'clear-flags') {
    await db.ref().update({
      [`guard/${uid}/flags`]: null,
      [`guard/${uid}/strikes`]: null,
      [`guard/${uid}/lastFlagAt`]: null
    });
    await auditLog(decoded.uid, 'clear-flags', { uid });
    return send(res, 200, { ok: true });
  }
  if (action === 'reset-budgets') {
    await db.ref().update({ [`guard/${uid}/w`]: null, [`guard/${uid}/t`]: null });
    await auditLog(decoded.uid, 'reset-budgets', { uid });
    return send(res, 200, { ok: true });
  }
  if (action === 'rename') {
    const out = await U.renameUser(uid, body.username);
    await fb.auth().revokeRefreshTokens(uid).catch(() => {});
    await auditLog(decoded.uid, 'rename', { uid, from: out.oldName, to: out.username });
    return send(res, 200, { ok: true, username: out.username });
  }
  if (action === 'delete') {
    if (body.confirm !== true) throw httpError(400, 'Confirmation required');
    const cleanup = await removeUserEverywhere(uid);
    try { await fb.auth().deleteUser(uid); } catch (e) {
      if (!(e && e.code === 'auth/user-not-found')) throw e;
    }
    await auditLog(decoded.uid, 'delete-account', { uid, cleaned: cleanup.cleaned });
    return send(res, 200, { ok: true, cleaned: cleanup.cleaned });
  }
  throw httpError(400, 'Unknown action');
});
