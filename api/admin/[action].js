const routes = {
  verify: require('../_lib/routes/admin/verify'),
  users: require('../_lib/routes/admin/users'),
  user: require('../_lib/routes/admin/user'),
  'reset-password': require('../_lib/routes/admin/reset-password'),
  'update-player': require('../_lib/routes/admin/update-player'),
  raw: require('../_lib/routes/admin/raw'),
  account: require('../_lib/routes/admin/account')
};

module.exports = (req, res) => {
  const name = req.query && req.query.action;
  const fn = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
  if (!fn) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Not found' }));
  }
  return fn(req, res);
};
