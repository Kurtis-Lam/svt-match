const { handler, send, rateLimit } = require('../../http');
const U = require('../../usernames');

module.exports = handler(['GET'], async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip').split(',')[0].trim();
  rateLimit(`avail:${ip}`, 40, 10 * 60 * 1000);
  const raw = req.query && req.query.u;
  let name;
  try {
    name = U.validate(raw);
  } catch (e) {
    return send(res, 200, { valid: false, available: false, message: e.message });
  }
  const existing = await U.findAuthByUsername(name);
  send(res, 200, { valid: true, available: !existing });
});
