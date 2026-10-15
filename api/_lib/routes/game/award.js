// File: api/_lib/routes/game/award.js
const { handler, send, rateLimit } = require('../../http');
const { requireUser } = require('../../auth');
const { processAward } = require('../../awards');

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireUser(req);
  rateLimit(`award:${decoded.uid}`, 120, 60 * 1000);
  const result = await processAward(decoded.uid, req.body);
  send(res, 200, result);
});