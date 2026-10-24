// Explicit endpoint for the secure game-write API.
// Keeping this route concrete ensures Vercel handles browser preflight requests
// for /api/game/write without relying on the dynamic [action] route.
module.exports = require('../_lib/routes/game/write');
