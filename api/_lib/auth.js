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

async function verifyIdToken(req, checkRevoked = true) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw httpError(401, 'Missing bearer token');
  const token = match[1];
  try {
    return await getAdmin().auth().verifyIdToken(token, checkRevoked);
  } catch (e) {
    const code = e && e.code ? String(e.code) : '';
    if (code === 'auth/id-token-revoked') throw httpError(401, 'Session was revoked, please sign in again');
    if (code === 'auth/id-token-expired') throw httpError(401, 'Invalid or expired token');
    if (checkRevoked && code !== 'auth/argument-error' && !code.startsWith('auth/id-token') && !code.startsWith('auth/invalid')) {
      try {
        return await getAdmin().auth().verifyIdToken(token, false);
      } catch (e2) {
        console.error('[auth] verifyIdToken failed:', e2 && e2.code, e2 && e2.message);
      }
    } else {
      console.error('[auth] verifyIdToken failed:', code, e && e.message);
    }
    throw httpError(401, 'Invalid or expired token');
  }
}

async function requireUser(req) {
  const decoded = await verifyIdToken(req, true);
  const uid = decoded.uid;
  const snap = await getAdmin().database().ref(`guard/${uid}/banned`).once('value');
  if (snap.val()) throw httpError(403, 'This account is suspended');
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
  const decoded = await verifyIdToken(req, true);
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