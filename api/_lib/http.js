function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const list = allowedOrigins();
  if (origin && list.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Session');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function handler(methods, fn) {
  return async (req, res) => {
    applyCors(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return send(res, 405, { error: 'Method not allowed' });
    }
    try {
      await fn(req, res);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      if (status >= 500) console.error('[api]', err);
      const body = { error: status >= 500 && !(err && err.expose) ? 'Internal error' : err.message };
      if (status >= 500 && err && err.code) body.code = String(err.code).slice(0, 60);
      send(res, status, body);
    }
  };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  entry.count += 1;
  buckets.set(key, entry);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  }
  if (entry.count > limit) throw httpError(429, 'Too many attempts, try again later');
}

module.exports = { handler, send, httpError, rateLimit };