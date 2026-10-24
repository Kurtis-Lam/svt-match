// File: public/js/gameplay/01b-secure-db.js
(function () {
  if (typeof db === 'undefined' || !db || typeof auth === 'undefined' || !auth) return;

  const API_BASE = String(window.__SVT_API_BASE__ || 'https://svt-match.vercel.app').replace(/\/$/, '');
  window.SVT_API_BASE = API_BASE;

  let sessionDead = false;
  const DEAD_AUTH_CODES = [
    'auth/user-token-expired',
    'auth/user-not-found',
    'auth/user-disabled',
    'auth/invalid-user-token',
    'auth/id-token-revoked',
    'auth/invalid-credential',
    'auth/requires-recent-login'
  ];

  function isDeadSessionError(e) {
    const code = e && e.code ? String(e.code) : '';
    if (DEAD_AUTH_CODES.indexOf(code) !== -1) return true;
    return /TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED|INVALID_REFRESH_TOKEN|INVALID_GRANT/i.test(String((e && e.message) || ''));
  }

  function endDeadSession() {
    if (sessionDead) return;
    sessionDead = true;
    ['stopSecondsOnlineTicker', 'stopDailyResetWatcher', 'stopFriendsMetaRefresh', 'stopRealtimeSync'].forEach((fn) => {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
    });
    try { localStorage.removeItem('currentUser'); } catch (e) {}
    try { currentUser = null; } catch (e) {}
    Promise.resolve()
      .then(() => auth.signOut())
      .catch(() => {})
      .then(() => {
        try { if (typeof showToast === 'function') showToast('Your session expired. Please sign in again.', 'error'); } catch (e) {}
        try { if (typeof showScreen === 'function') showScreen('welcomeScreen'); } catch (e) {}
      });
  }

  function sessionError() {
    const err = new Error('Session expired. Please sign in again.');
    err.status = 401;
    err.code = 'permission-denied';
    return err;
  }

  auth.onAuthStateChanged((u) => { if (u) sessionDead = false; });

  async function svtApi(path, opts) {
    const o = opts || {};
    if (o.auth !== false && sessionDead) {
      const e = new Error('Not signed in');
      e.code = 'unauthenticated';
      throw e;
    }
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
    let res;
    try {
      res = await attempt(!!o.forceRefresh);
    } catch (e) {
      if (e && e.code !== 'unauthenticated' && o.auth !== false && isDeadSessionError(e)) {
        endDeadSession();
        throw sessionError();
      }
      throw e;
    }
    if (res.status >= 500 && res.status !== 501) {
      await new Promise((r) => setTimeout(r, 800));
      try { res = await attempt(false); } catch (e) {}
    }
    if (res.status === 401 && o.auth !== false) {
      try { res = await attempt(true); } catch (e) {
        if (e && e.code === 'unauthenticated') throw e;
        if (isDeadSessionError(e)) {
          endDeadSession();
          throw sessionError();
        }
        const err = new Error('Could not refresh your session. Check your connection and try again.');
        err.status = 0;
        err.code = 'network-error';
        throw err;
      }
      if (res.status === 401) {
        endDeadSession();
        throw sessionError();
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
  let awardEpoch = 0;

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
      pendingState.epoch = awardEpoch;
      return new Promise((resolve, reject) => pendingState.waiters.push({ resolve, reject }));
    }
    const job = { ops, waiters: [], isState: !!coalesce, epoch: awardEpoch };
    const promise = new Promise((resolve, reject) => job.waiters.push({ resolve, reject }));
    if (coalesce) pendingState = job;
    chain = chain.then(async () => {
      if (pendingState === job) pendingState = null;
      if (job.isState && job.epoch !== awardEpoch) {
        // A server award landed after this save was built, so it carries stale coins/levels.
        // Drop it and save a fresh copy built from the up-to-date state.
        job.waiters.forEach((w) => w.resolve(undefined));
        setTimeout(() => { try { if (typeof savePlayerState === 'function') savePlayerState(); } catch (e) {} }, 0);
        return;
      }
      try {
        const r = await send(job.ops);
        job.waiters.forEach((w) => w.resolve(r));
      } catch (e) {
        job.waiters.forEach((w) => w.reject(e));
      }
    });
    return promise;
  }

  // Coins and levels are only ever raised by the server. The client reports what happened
  // (finished a level, claimed a quest ...) and applies the authoritative numbers it gets back.
  window.svtAward = function (source, ctx) {
    return new Promise((resolve, reject) => {
      chain = chain.then(async () => {
        try {
          const res = await svtApi('/api/game/award', { body: { source, ctx: ctx || {} } });
          awardEpoch++;
          if (res && res.values && typeof window.__svtApplyServerValues === 'function') {
            try { window.__svtApplyServerValues(res.values); } catch (e) {}
          }
          resolve(res);
        } catch (e) {
          reject(e);
        }
      });
    });
  };

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