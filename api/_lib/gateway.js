const { getAdmin } = require('./firebase');
const { httpError } = require('./http');
const G = require('./guard');

const { LIMITS, num, clone, same, toArr } = G;

const SEG_RE = /^[A-Za-z0-9_\-:@+~]{1,200}$/;
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEASON_RE = /^s\d{1,8}$/;
const REQ_RE = /^[A-Za-z0-9_\-]{1,120}$/;

const OTHER_PLAYER_PATHS = new Set([
  'battles/pendingIncoming',
  'battles/pendingOutgoing',
  'battles/logs',
  'stats/battleWins',
  'stats/battleLosses',
  'friends/list',
  'friends/incoming',
  'friends/outgoing'
]);

function splitPath(p) {
  if (typeof p !== 'string') throw httpError(400, 'Invalid path');
  const segs = p.split('/').filter((s) => s.length);
  if (!segs.length || segs.length > 12) throw httpError(400, 'Invalid path');
  for (const s of segs) if (!SEG_RE.test(s)) throw httpError(400, 'Invalid path segment');
  return segs;
}

function db() {
  return getAdmin().database();
}

const BAD_KEY_RE = /[.$#\[\]\/\u0000-\u001f\u007f]/g;

function cleanKeys(v) {
  if (Array.isArray(v)) return v.map(cleanKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      if (v[k] === undefined) continue;
      let nk = k.replace(BAD_KEY_RE, '_');
      if (!nk) nk = '_';
      out[nk] = cleanKeys(v[k]);
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return 0;
  return v;
}

function setIn(root, segs, value) {
  if (!segs.length) return value;
  const base = root && typeof root === 'object' ? root : {};
  let cur = base;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = segs[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  const last = segs[segs.length - 1];
  if (value === null || value === undefined) delete cur[last];
  else cur[last] = value;
  return base;
}

function bytes(v) {
  return JSON.stringify(v === undefined ? null : v).length;
}

function involvesBattle(b, me) {
  return !!b && (b.fromUserId === me || b.toUserId === me);
}

function involvesLog(e, me) {
  return !!e && [e.winner, e.loser, e.player1, e.player2].some((p) => p && p.userId === me);
}

function validateItems(arr) {
  if (arr.length > LIMITS.MAX_LIST) throw httpError(400, 'List too long');
  for (const it of arr) {
    if (!it || typeof it !== 'object') throw httpError(400, 'Invalid list item');
    if (bytes(it) > LIMITS.MAX_ITEM_BYTES) throw httpError(400, 'List item too large');
  }
}

function idSet(arr) {
  return new Set(arr.map((x) => x && x.id));
}

function checkBattleList(kind, me, target, oldArr, newArr) {
  validateItems(newArr);
  if (kind === 'pendingIncoming' && newArr.length > LIMITS.MAX_INCOMING_BATTLES && newArr.length > oldArr.length) {
    throw httpError(429, 'This player has too many pending battles');
  }
  const isMine = (b) => involvesBattle(b, me);
  const restOld = oldArr.filter((b) => !isMine(b));
  const restNew = newArr.filter((b) => !isMine(b));
  if (!same(restOld, restNew)) throw httpError(403, 'You can only change battles that involve you');
  const oldIds = idSet(oldArr);
  for (const b of newArr.filter(isMine)) {
    if (typeof b.id !== 'string' || !b.id) throw httpError(400, 'Battle needs an id');
    if (oldIds.has(b.id)) continue;
    if (kind === 'pendingIncoming') {
      if (b.fromUserId !== me || b.toUserId !== target) throw httpError(403, 'Invalid battle challenge');
      if (b.status !== 'awaiting_accept') throw httpError(400, 'Invalid battle status');
      if (newArr.filter((x) => x && x.fromUserId === me).length > LIMITS.MAX_BATTLES_PER_SENDER) {
        throw httpError(429, 'Too many pending battles with this player');
      }
    } else {
      throw httpError(403, 'You cannot create this battle entry');
    }
  }
  return newArr;
}

function checkLogs(me, oldArr, newArr, ctx, target) {
  validateItems(newArr);
  if (newArr.length < oldArr.length || newArr.length > oldArr.length + 1) throw httpError(403, 'Invalid battle log update');
  for (let i = 0; i < oldArr.length; i++) {
    if (!same(oldArr[i], newArr[i])) throw httpError(403, 'Existing battle logs are read-only');
  }
  if (newArr.length === oldArr.length + 1) {
    const entry = newArr[newArr.length - 1];
    if (!involvesLog(entry, me)) throw httpError(403, 'Battle log must involve you');
    ctx.logAdds[target] = entry;
  }
  return newArr;
}

function checkRemovalOnly(me, kind, oldArr, newArr) {
  validateItems(newArr);
  const mineOf = (x) => (kind === 'list' ? x && x.userId === me : involvesBattle(x, me));
  const oldCanon = oldArr.map((x) => JSON.stringify(G.canon(x)));
  for (const x of newArr) {
    if (!oldCanon.includes(JSON.stringify(G.canon(x)))) throw httpError(403, 'Additions are not allowed here');
  }
  const newCanon = new Set(newArr.map((x) => JSON.stringify(G.canon(x))));
  oldArr.forEach((x, i) => {
    if (!newCanon.has(oldCanon[i]) && !mineOf(x)) throw httpError(403, 'You can only remove your own entries');
  });
  return newArr;
}

async function txn(path, fn) {
  let failure = null;
  let applied = false;
  const result = await db().ref(path).transaction((cur) => {
    failure = null;
    try {
      const out = fn(cur);
      if (out === undefined) return;
      return out;
    } catch (e) {
      failure = e;
      return;
    }
  }, undefined, false);
  if (failure) throw failure;
  applied = !!(result && result.committed);
  return { committed: applied, value: result && result.snapshot ? result.snapshot.val() : null };
}

async function userExists(uid) {
  const [u, d] = await Promise.all([
    db().ref(`users/${uid}/username`).once('value'),
    db().ref(`guard/${uid}/deleting`).once('value')
  ]);
  return u.exists() && !d.exists();
}

async function rollbackIfGone(uid, paths) {
  if (await userExists(uid)) return false;
  for (const p of paths) await db().ref(p).remove().catch(() => {});
  return true;
}

async function areFriends(a, b) {
  const s = await db().ref(`users/${b}/playerState/friends/list`).once('value');
  return toArr(s.val()).some((f) => f && f.userId === a);
}

async function getGuard(uid) {
  const s = await db().ref(`guard/${uid}`).once('value');
  const g = s.val();
  return g && typeof g === 'object' ? g : {};
}

async function saveGuard(uid, g) {
  if (!(await userExists(uid))) return;
  const out = cleanKeys(clone(g));
  delete out.banned;
  const keep = await db().ref(`guard/${uid}/banned`).once('value');
  if (keep.exists()) out.banned = keep.val();
  await db().ref(`guard/${uid}`).set(out);
}

function normalizeFriendRequest(me, dir, owner, reqId, value, mine) {
  if (!value || typeof value !== 'object') throw httpError(400, 'Invalid friend request');
  if (!REQ_RE.test(reqId)) throw httpError(400, 'Invalid request id');
  if (value.id !== reqId) throw httpError(400, 'Request id mismatch');
  if (value.fromUserId !== me) throw httpError(403, 'Requests must come from you');
  const to = value.toUserId;
  if (typeof to !== 'string' || !UID_RE.test(to) || to === me) throw httpError(400, 'Invalid recipient');
  if (dir === 'outgoing' && owner !== me) throw httpError(403, 'Not your outgoing list');
  if (dir === 'incoming' && owner !== to) throw httpError(403, 'Recipient mismatch');
  const str = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n);
  return {
    id: reqId,
    fromUserId: me,
    fromUsername: mine.username,
    fromDisplayName: mine.displayName || mine.username,
    fromAvatarSrc: str(value.fromAvatarSrc, 200),
    toUserId: to,
    toUsername: str(value.toUsername, 60),
    toDisplayName: str(value.toDisplayName, 60),
    createdAt: Date.now()
  };
}

async function processWrite(me, rawOps) {
  if (!Array.isArray(rawOps) || !rawOps.length || rawOps.length > 60) throw httpError(400, 'Invalid operations');
  const now = Date.now();
  if (!(await userExists(me))) throw httpError(404, 'Profile not found');
  const guard = await getGuard(me);
  guard.t = guard.t && typeof guard.t === 'object' ? guard.t : {};
  const w = G.rollWindow(guard, now);

  const expanded = [];
  for (const raw of rawOps) {
    if (!raw || (raw.op !== 'set' && raw.op !== 'remove')) throw httpError(400, 'Invalid operation');
    const segs = splitPath(raw.path);
    const value = raw.op === 'remove' ? null : raw.value === undefined ? null : raw.value;
    if (
      segs.length === 4 && segs[0] === 'users' && segs[2] === 'playerState' && segs[3] === 'friends' &&
      segs[1] !== me && value && typeof value === 'object'
    ) {
      for (const k of Object.keys(value)) {
        if (!['list', 'incoming', 'outgoing'].includes(k)) throw httpError(403, 'Not allowed');
        expanded.push({ segs: [...segs, k], value: value[k] === undefined ? null : value[k] });
      }
      continue;
    }
    expanded.push({ segs, value });
  }

  const ownStateOps = [];
  const crossOps = [];
  const statOps = [];
  const directWrites = [];
  const ctx = { logAdds: {} };
  const result = {};
  let mine = null;
  const loadMine = async () => {
    if (mine) return mine;
    const s = await db().ref(`users/${me}`).once('value');
    const u = s.val() || {};
    mine = { username: String(u.username || ''), displayName: String(u.displayName || u.username || '') };
    return mine;
  };

  for (const op of expanded) {
    const { segs, value } = op;
    const root = segs[0];

    if (root === 'seasons') {
      if (segs.length !== 3 || !SEASON_RE.test(segs[1]) || segs[2] !== me) throw httpError(403, 'Not allowed');
      if (value === null) throw httpError(403, 'Not allowed');
      directWrites.push({ kind: 'season', sid: segs[1] , value });
      continue;
    }

    if (root !== 'users' || !UID_RE.test(segs[1] || '')) throw httpError(403, 'Not allowed');
    const owner = segs[1];
    const sub = segs.slice(2);

    if (sub.length === 0) {
      throw httpError(403, 'Use the delete-account endpoint to delete an account');
    }

    if (sub[0] === 'displayName' && sub.length === 1) {
      if (owner !== me) throw httpError(403, 'Not allowed');
      const name = String(value === null ? '' : value).trim();
      if (name.length < 2 || name.length > 30 || !/^[\w\s\-'.!?]+$/u.test(name)) throw httpError(400, 'Invalid display name');
      directWrites.push({ kind: 'plain', path: `users/${me}/displayName`, value: name });
      directWrites.push({ kind: 'plainIfExists', path: `users/${me}/playerState/displayName`, value: name });
      continue;
    }

    if (sub[0] === 'username') throw httpError(403, 'Use the username endpoint to rename');

    if (sub[0] === 'password' && sub.length === 1) {
      if (owner !== me || value !== null) throw httpError(403, 'Not allowed');
      directWrites.push({ kind: 'plain', path: `users/${me}/password`, value: null });
      continue;
    }

    if (sub[0] === 'analytics') {
      if (owner !== me) throw httpError(403, 'Not allowed');
      if (sub.length === 2 && sub[1] === 'lastSeenAt') {
        directWrites.push({ kind: 'plain', path: `users/${me}/analytics/lastSeenAt`, value: now });
        continue;
      }
      if (sub.length === 3 && sub[1] === 'secondsOnline' && DAY_RE.test(sub[2])) {
        const dayMs = Date.parse(sub[2] + 'T00:00:00Z');
        if (!Number.isFinite(dayMs) || Math.abs(now - dayMs) > 3 * 86400000) throw httpError(400, 'Invalid day');
        directWrites.push({ kind: 'seconds', day: sub[2], value: num(value, 0) });
        continue;
      }
      throw httpError(403, 'Not allowed');
    }

    if (sub[0] === 'friendRequests') {
      if (sub.length !== 3 || (sub[1] !== 'incoming' && sub[1] !== 'outgoing')) throw httpError(403, 'Not allowed');
      const dir = sub[1];
      const reqId = sub[2];
      if (!REQ_RE.test(reqId)) throw httpError(400, 'Invalid request id');
      if (value === null) {
        directWrites.push({ kind: 'reqRemove', owner, dir, reqId });
      } else {
        const m = await loadMine();
        const clean = normalizeFriendRequest(me, dir, owner, reqId, value, m);
        directWrites.push({ kind: 'reqSet', owner, dir, reqId, value: clean });
      }
      continue;
    }

    if (sub[0] === 'playerState') {
      if (owner === me) {
        ownStateOps.push({ segs: sub.slice(1), value });
        continue;
      }
      const rel = sub.slice(1).join('/');
      if (!OTHER_PLAYER_PATHS.has(rel)) throw httpError(403, 'Not allowed');
      if (rel.startsWith('stats/')) statOps.push({ target: owner, key: sub[sub.length - 1], value });
      else crossOps.push({ target: owner, rel, value });
      continue;
    }

    throw httpError(403, 'Not allowed');
  }

  const friendChecked = new Map();
  const mustBeFriends = async (target) => {
    if (!friendChecked.has(target)) friendChecked.set(target, await areFriends(me, target));
    if (!friendChecked.get(target)) throw httpError(403, 'You can only do this with friends');
  };
  for (const c of crossOps) {
    if (c.rel === 'battles/pendingIncoming' || c.rel === 'battles/logs') await mustBeFriends(c.target);
    const path = `users/${c.target}/playerState/${c.rel}`;
    if (!(await userExists(c.target))) throw httpError(404, 'Player not found');
    const newArr = c.value === null ? [] : toArr(c.value);
    const r = await txn(path, (cur) => {
      const oldArr = toArr(cur);
      let out;
      if (c.rel === 'battles/pendingIncoming') out = checkBattleList('pendingIncoming', me, c.target, oldArr, newArr);
      else if (c.rel === 'battles/pendingOutgoing') out = checkBattleList('pendingOutgoing', me, c.target, oldArr, newArr);
      else if (c.rel === 'battles/logs') out = checkLogs(me, oldArr, newArr, ctx, c.target);
      else if (c.rel === 'friends/list') out = checkRemovalOnly(me, 'list', oldArr, newArr);
      else out = checkRemovalOnly(me, 'req', oldArr, newArr);
      return out.length ? out : null;
    });
    if (r.committed && (await rollbackIfGone(c.target, [path]))) throw httpError(404, 'Player not found');
  }

  for (const s of statOps) {
    if (s.key !== 'battleWins' && s.key !== 'battleLosses') throw httpError(403, 'Not allowed');
    const entry = ctx.logAdds[s.target];
    if (!entry) throw httpError(403, 'Battle stat changes need a matching battle log');
    const targetWon = entry.winner && entry.winner.userId === s.target;
    const targetLost = entry.loser && entry.loser.userId === s.target;
    if (s.key === 'battleWins' && !targetWon) throw httpError(403, 'Log does not show a win for this player');
    if (s.key === 'battleLosses' && !targetLost) throw httpError(403, 'Log does not show a loss for this player');
    await mustBeFriends(s.target);
    if (num(w.bs) >= LIMITS.BATTLE_STAT_HOURLY) throw httpError(429, 'Too many battle updates');
    w.bs = num(w.bs) + 1;
    const pairKey = `bp_${s.target}`.slice(0, 40);
    const last = num(guard.t[pairKey]);
    if (now - last < 15000) throw httpError(429, 'Too many battle updates');
    guard.t[pairKey] = now;
    await txn(`users/${s.target}/playerState/stats/${s.key}`, (cur) => {
      const o = num(cur);
      if (num(s.value) !== o + 1) throw httpError(403, 'Invalid battle stat change');
      return o + 1;
    });
  }

  if (ownStateOps.length) {
    let final = null;
    const r = await txn(`users/${me}/playerState`, (cur) => {
      let working = cur && typeof cur === 'object' ? clone(cur) : {};
      for (const o of ownStateOps) {
        if (!o.segs.length) working = o.value && typeof o.value === 'object' && !Array.isArray(o.value) ? clone(o.value) : {};
        else working = setIn(working, o.segs, clone(o.value));
      }
      const g = clone(guard);
      const out = G.sanitizeOwnState(cur, cleanKeys(working), g, now, me);
      out.state = cleanKeys(clone(out.state));
      out.state.updatedAt = now;
      final = out;
      return out.state;
    });
    if (final) {
      Object.assign(guard, final.guard);
      result.state = {
        clamped: final.clamped,
        values: {
          coins: final.state.coins,
          level: final.state.level,
          spotlightLevel: final.state.spotlightLevel,
          snakeventeenLevel: final.state.snakeventeenLevel,
          rings: final.state.rings,
          totalCoinsEarned: final.state.stats && final.state.stats.totalCoinsEarned
        }
      };
    }
  }

  for (const d of directWrites) {
    if (d.kind === 'plain') {
      await db().ref(d.path).set(d.value);
    } else if (d.kind === 'plainIfExists') {
      const s = await db().ref(`users/${me}/playerState`).once('value');
      if (s.exists()) await db().ref(d.path).set(d.value);
    } else if (d.kind === 'seconds') {
      const ref = db().ref(`users/${me}/analytics/secondsOnline/${d.day}`);
      const cur = num((await ref.once('value')).val());
      let delta = d.value - cur;
      if (delta > 0) {
        const room = Math.max(0, LIMITS.SECS_HOURLY - num(w.secs));
        delta = Math.min(delta, LIMITS.SECS_SINGLE, room);
        w.secs = num(w.secs) + delta;
        await ref.set(cur + delta);
      }
    } else if (d.kind === 'reqSet') {
      if (!(await userExists(d.value.toUserId))) throw httpError(404, 'Player not found');
      if (d.owner === d.value.toUserId || d.owner === me) {
        if (d.dir === 'outgoing') {
          if (num(w.fr) >= LIMITS.FRIEND_REQ_HOURLY) throw httpError(429, 'Too many friend requests');
          w.fr = num(w.fr) + 1;
        }
        const reqPath = `users/${d.owner}/friendRequests/${d.dir}/${d.reqId}`;
        if (d.dir === 'incoming') {
          const inbox = (await db().ref(`users/${d.owner}/friendRequests/incoming`).once('value')).val() || {};
          const keys = Object.keys(inbox);
          if (!(d.reqId in inbox) && keys.length >= LIMITS.MAX_INCOMING_REQUESTS) throw httpError(429, 'This player has too many pending requests');
        }
        await db().ref(reqPath).set(d.value);
        if (d.owner !== me && (await rollbackIfGone(d.owner, [reqPath]))) throw httpError(404, 'Player not found');
      }
    } else if (d.kind === 'reqRemove') {
      const ref = db().ref(`users/${d.owner}/friendRequests/${d.dir}/${d.reqId}`);
      if (d.owner !== me) {
        const cur = (await ref.once('value')).val();
        if (cur && !(cur.fromUserId === me || cur.toUserId === me)) throw httpError(403, 'Not your request');
      }
      await ref.remove();
    } else if (d.kind === 'season') {
      const ref = db().ref(`seasons/${d.sid}/${me}`);
      const cur = (await ref.once('value')).val();
      const clean = G.sanitizeSeason(cur, d.value, guard, now);
      if (!clean) throw httpError(400, 'Invalid season entry');
      await ref.set(clean);
    }
  }

  await saveGuard(me, guard);
  return result;
}

module.exports = { processWrite, getGuard, saveGuard, txn, db, userExists, UID_RE };