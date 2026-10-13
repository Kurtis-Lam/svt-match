(function () {
  if (typeof db === 'undefined' || !db || typeof auth === 'undefined' || !auth) return;

  const API_BASE = String(window.__SVT_API_BASE__ || 'https://svt-match.web.app').replace(/\/$/, '');
  window.SVT_API_BASE = API_BASE;

  async function svtApi(path, opts) {
    const o = opts || {};
    const method = o.method || (o.body !== undefined ? 'POST' : 'GET');
    const attempt = async (forceRefresh) => {
      const headers = {};
      if (o.auth !== false) {
        const user = auth.currentUser;
        if (!user) {
          const e = new Error('Not signed in');
          e.code = 'unauthenticated';
          throw e;
        }
        headers['Authorization'] = 'Bearer ' + (await user.getIdToken(!!forceRefresh));
      }
      if (o.body !== undefined) headers['Content-Type'] = 'application/json';
      return fetch(API_BASE + path, {
        method,
        headers,
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined
      });
    };
    let res = await attempt(!!o.forceRefresh);
    if (res.status >= 500 && res.status !== 501) {
      await new Promise((r) => setTimeout(r, 800));
      try { res = await attempt(false); } catch (e) {}
    }
    if (res.status === 401 && o.auth !== false) {
      try { res = await attempt(true); } catch (e) {
        if (e && e.code === 'unauthenticated') throw e;
        const err = new Error('Session expired. Please sign in again.');
        err.status = 401;
        err.code = 'permission-denied';
        throw err;
      }
    }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      if (data && data.code) err.serverCode = data.code;
      err.code = res.status === 401 || res.status === 403 ? 'permission-denied' : 'api-error';
      throw err;
    }
    return data;
  }
  window.svtApi = svtApi;

  const rawDb = db;
  let chain = Promise.resolve();
  let pendingState = null;

  function send(ops) {
    return svtApi('/api/game/write', { body: { ops } }).then((res) => {
      if (res && res.state && res.state.clamped && typeof window.__svtOnServerClamp === 'function') {
        try { window.__svtOnServerClamp(res.state.values); } catch (e) {}
      }
      return undefined;
    });
  }

  function enqueue(ops, coalesce) {
    if (coalesce && pendingState) {
      pendingState.ops = ops;
      return new Promise((resolve, reject) => pendingState.waiters.push({ resolve, reject }));
    }
    const job = { ops, waiters: [] };
    const promise = new Promise((resolve, reject) => job.waiters.push({ resolve, reject }));
    if (coalesce) pendingState = job;
    chain = chain.then(async () => {
      if (pendingState === job) pendingState = null;
      try {
        const r = await send(job.ops);
        job.waiters.forEach((w) => w.resolve(r));
      } catch (e) {
        job.waiters.forEach((w) => w.reject(e));
      }
    });
    return promise;
  }

  function clean(p) {
    return String(p || '').replace(/^\/+|\/+$/g, '');
  }
  function join(a, b) {
    const x = clean(a);
    const y = clean(b);
    return x && y ? x + '/' + y : x || y;
  }
  function isOwnStateRoot(path) {
    const u = auth.currentUser;
    return !!u && clean(path) === 'users/' + u.uid + '/playerState';
  }
  function toOp(path, value) {
    return value === null || value === undefined
      ? { op: 'remove', path }
      : { op: 'set', path, value: JSON.parse(JSON.stringify(value)) };
  }

  function wrapRef(path) {
    const base = clean(path);
    const real = base ? rawDb.ref(base) : rawDb.ref();
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'set') {
          return (value) => enqueue([toOp(base, value)], value !== null && value !== undefined && isOwnStateRoot(base));
        }
        if (prop === 'remove') return () => enqueue([{ op: 'remove', path: base }], false);
        if (prop === 'update') {
          return (map) => {
            const ops = Object.keys(map || {}).map((k) => toOp(join(base, k), map[k]));
            if (!ops.length) return Promise.resolve();
            return enqueue(ops, false);
          };
        }
        if (prop === 'transaction') {
          return async (fn) => {
            const snap = await target.once('value');
            const next = fn(snap.val());
            if (next === undefined) return { committed: false, snapshot: snap };
            await enqueue([toOp(base, next)], false);
            return { committed: true, snapshot: snap };
          };
        }
        if (prop === 'push') {
          return () => { throw new Error('push is not supported'); };
        }
        if (prop === 'child') return (c) => wrapRef(join(base, c));
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      }
    });
  }

  db = new Proxy(rawDb, {
    get(target, prop) {
      if (prop === 'ref') return (p) => wrapRef(p);
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    }
  });
})();