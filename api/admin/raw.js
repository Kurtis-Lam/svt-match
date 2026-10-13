const { handler, send, httpError, rateLimit } = require('../_lib/http');
const { requireAdminSession, auditLog } = require('../_lib/auth');
const { getAdmin } = require('../_lib/firebase');

const SEG_RE = /^[A-Za-z0-9_\-:@+~]{1,200}$/;

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`raw:${decoded.uid}`, 60, 10 * 60 * 1000);
  const body = req.body || {};
  const uid = typeof body.uid === 'string' ? body.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
  const op = body.op;
  if (op !== 'set' && op !== 'remove') throw httpError(400, 'Invalid operation');
  const segs = String(body.path || '').split('/').filter(Boolean);
  if (!segs.length || segs.length > 10 || !segs.every((s) => SEG_RE.test(s))) throw httpError(400, 'Invalid path');
  if (segs[0] === 'username') throw httpError(400, 'Use Rename to change usernames');
  if (segs[0] === 'password' && op === 'set') throw httpError(400, 'Passwords cannot be written to the database');

  const db = getAdmin().database();
  if (!(await db.ref(`users/${uid}`).once('value')).exists()) throw httpError(404, 'User not found');
  const ref = db.ref(`users/${uid}/${segs.join('/')}`);
  const before = (await ref.once('value')).val();
  if (op === 'remove') {
    await ref.remove();
  } else {
    if (body.value === undefined) throw httpError(400, 'Missing value');
    if (JSON.stringify(body.value).length > 256000) throw httpError(400, 'Value too large');
    await ref.set(body.value);
  }
  await auditLog(decoded.uid, 'raw-' + op, {
    uid,
    path: segs.join('/'),
    before: JSON.stringify(before === undefined ? null : before).slice(0, 500),
    after: op === 'set' ? JSON.stringify(body.value).slice(0, 500) : null
  });
  send(res, 200, { ok: true });
});
