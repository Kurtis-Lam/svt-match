const routes = {
  write: require('../_lib/routes/game/write'),
  award: require('../_lib/routes/game/award'),
  'delete-account': require('../_lib/routes/game/delete-account'),
  register: require('../_lib/routes/game/register'),
  username: require('../_lib/routes/game/username'),
  'username-available': require('../_lib/routes/game/username-available'),
  'find-user': require('../_lib/routes/game/find-user'),
  'friend-accept': require('../_lib/routes/game/friend-accept')
};

const { applyCors } = require('../_lib/http');

module.exports = (req, res) => {
  const name = req.query && req.query.action;
  const fn = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
  if (!fn) {
    applyCors(req, res);
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Not found' }));
  }
  return fn(req, res);
};