const crypto = require('crypto');
const { getAdmin } = require('./firebase');
const { httpError } = require('./http');

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function sessionSecret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authFail(status, message, code) {
  const e = httpError(status, message);
  e.code = code || '';
  return e;
}

async function verifyIdToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw httpError(401, 'Missing bearer token');
  try {
    return await getAdmin().auth().verifyIdToken(match[1], true);
  } catch (e) {
    const code = e && e.code ? String(e.code) : 'unknown';
    console.error('[auth] verifyIdToken failed:', code, e && e.message);
    if (code === 'auth/user-disabled') throw authFail(403, 'This account is suspended', code);
    if (code === 'auth/user-not-found') throw authFail(401, 'Account no longer exists', code);
    if (code === 'auth/id-token-revoked') throw authFail(401, 'Session was revoked, please sign in again', code);
    throw authFail(401, 'Invalid or expired token (' + code + ')', code);
  }
}

async function requireUser(req, opts) {
  const decoded = await verifyIdToken(req);
  const snap = await getAdmin().database().ref(`guard/${decoded.uid}`).once('value');
  const g = snap.val() || {};
  if (g.banned) throw httpError(403, 'This account is suspended');
  if (g.deleting && !(opts && opts.allowDeleting)) throw httpError(410, 'This account is being deleted');
  return decoded;
}

async function isAuthorizedUid(uid) {
  const envUids = (process.env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (envUids.includes(uid)) return true;
  try {
    const snap = await getAdmin().firestore().doc('admin/config').get();
    const list = snap.exists ? snap.get('authorizedUids') : null;
    return Array.isArray(list) && list.includes(uid);
  } catch (e) {
    return false;
  }
}

async function requireAdminAccount(req) {
  const decoded = await verifyIdToken(req);
  if (!(await isAuthorizedUid(decoded.uid))) throw httpError(403, 'Not an authorised admin');
  return decoded;
}

function issueSession(uid) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${uid}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: exp };
}

async function requireAdminSession(req) {
  const decoded = await requireAdminAccount(req);
  const token = req.headers['x-admin-session'] || '';
  const parts = String(token).split('.');
  if (parts.length !== 3) throw httpError(401, 'Admin session required');
  const [uid, exp, sig] = parts;
  if (uid !== decoded.uid || !(Number(exp) > Date.now()) || !safeEqual(sig, sign(`${uid}.${exp}`))) {
    throw httpError(401, 'Admin session expired');
  }
  return decoded;
}

async function auditLog(adminUid, action, detail) {
  try {
    await getAdmin().database().ref('adminLogs').push({
      at: Date.now(),
      by: adminUid,
      action: String(action).slice(0, 60),
      detail: JSON.parse(JSON.stringify(detail === undefined ? null : detail))
    });
  } catch (e) {
    console.error('[audit]', e);
  }
}

module.exports = {
  requireUser,
  requireAdminAccount,
  requireAdminSession,
  issueSession,
  safeEqual,
  auditLog
};