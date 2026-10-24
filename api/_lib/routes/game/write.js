const { handler, send, rateLimit } = require('../../http');
const { requireUser } = require('../../auth');
const { processWrite } = require('../../gateway');

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireUser(req);
  rateLimit(`write:${decoded.uid}`, 400, 60 * 1000);
  const ops = req.body && req.body.ops;
  const result = await processWrite(decoded.uid, ops);
  send(res, 200, { ok: true, ...result });
});
