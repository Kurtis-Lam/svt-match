// File: api/_lib/guard.js
const HOUR_MS = 60 * 60 * 1000;

const LIMITS = {
  SINGLE_EARN: 600000,
  HOURLY_EARN: 4000000,
  LEVEL_MS: 5000,
  LEVEL_SINGLE_MAX: 20,
  LEVEL_HOURLY: 720,
  RINGS_SINGLE: 25,
  RINGS_HOURLY: 100,
  STAT_SINGLE: 25,
  WINLOSS_HOURLY: 120,
  ITEMS_SINGLE: 10,
  ITEMS_HOURLY: 60,
  SP_SINGLE: 150,
  SP_HOURLY: 800,
  SP_MAX: 20000,
  DIAMONDS_SINGLE_EARN: 10,
  DIAMONDS_HOURLY_EARN: 20,
  SECS_SINGLE: 120,
  SECS_HOURLY: 3700,
  FRIEND_REQ_HOURLY: 30,
  MAX_STATE_BYTES: 400000,
  MAX_LIST: 300,
  MAX_ITEM_BYTES: 60000,
  MAX_INCOMING_BATTLES: 50,
  MAX_BATTLES_PER_SENDER: 5,
  MAX_INCOMING_REQUESTS: 100,
  BATTLE_STAT_HOURLY: 60,
  BATTLE_CREATE_HOURLY: 60
};

const ITEM_MAPS = ['ownedIdols', 'ownedAvatars', 'ownedProfileBackgrounds', 'ownedProfileTitles', 'marriedIdols', 'ownedFrames'];
const LEVEL_FIELDS = [
  ['level', 'lvl'],
  ['spotlightLevel', 'sl'],
  ['snakeventeenLevel', 'sn']
];

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach((k) => {
      if (v[k] === null || v[k] === undefined) return;
      out[k] = canon(v[k]);
    });
    return out;
  }
  return v;
}

function same(a, b) {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

function toArr(v) {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined);
  if (v && typeof v === 'object') return Object.values(v).filter((x) => x !== null && x !== undefined);
  return [];
}

function rollWindow(g, now) {
  if (!g.w || !(now - num(g.w.s) < HOUR_MS)) g.w = { s: now };
  return g.w;
}

function addFlag(g, now, type, detail) {
  g.strikes = num(g.strikes) + 1;
  const list = Array.isArray(g.flags) ? g.flags : toArr(g.flags);
  list.push({ t: now, type, detail: String(detail).slice(0, 200) });
  g.flags = list.slice(-25);
  g.lastFlagAt = now;
}

function sanitizeOwnState(oldState, nextState, guard, now, uid) {
  const old = oldState && typeof oldState === 'object' ? oldState : {};
  const next = nextState && typeof nextState === 'object' ? nextState : {};
  const g = guard;
  const w = rollWindow(g, now);
  g.t = g.t && typeof g.t === 'object' ? g.t : {};
  let clamped = false;
  const flag = (type, detail) => {
    clamped = true;
    addFlag(g, now, type, detail);
  };

  if (JSON.stringify(next).length > LIMITS.MAX_STATE_BYTES) {
    flag('oversize', 'state exceeded size limit; previous state kept');
    return { state: clone(old), clamped: true, guard: g };
  }

  if (!next.stats || typeof next.stats !== 'object' || Array.isArray(next.stats)) next.stats = {};
  const oStats = old.stats && typeof old.stats === 'object' ? old.stats : {};
  const stats = next.stats;

  const oE = num(oStats.totalCoinsEarned);
  if (num(stats.totalCoinsEarned, oE) > oE) flag('earned_locked', 'totalCoinsEarned can only be raised by the server');
  stats.totalCoinsEarned = oE;

  const oC = Math.max(0, num(old.coins));
  let nC = Math.max(0, Math.floor(num(next.coins, oC)));
  if (nC > oC) {
    flag('coin_locked', `coins ${oC} -> ${nC}; coins can only be awarded by the server`);
    nC = oC;
  }
  next.coins = nC;

  const oD = Math.max(0, Math.floor(num(old.diamonds)));
  let nD = Math.max(0, Math.floor(num(next.diamonds, oD)));
  const diamondPrice = 1000;
  const boughtDiamonds = Math.floor(Math.max(0, oC - nC) / diamondPrice);
  const diamondEarnRoom = Math.max(0, LIMITS.DIAMONDS_HOURLY_EARN - num(w.dg));
  const diamondEarnAllowed = Math.min(LIMITS.DIAMONDS_SINGLE_EARN, diamondEarnRoom);
  const maxD = oD + boughtDiamonds + diamondEarnAllowed;
  if (nD > maxD) {
    flag('diamond_jump', `diamonds ${oD} -> ${nD}, allowed up to ${maxD}`);
    nD = maxD;
  }
  const unpurchasedGain = Math.max(0, nD - oD - boughtDiamonds);
  if (unpurchasedGain > 0) w.dg = num(w.dg) + unpurchasedGain;
  next.diamonds = nD;

  next.idolFrameAssignments = next.idolFrameAssignments && typeof next.idolFrameAssignments === 'object' && !Array.isArray(next.idolFrameAssignments) ? next.idolFrameAssignments : {};

  for (const [field] of LEVEL_FIELDS) {
    const oL = Math.max(0, Math.floor(num(old[field])));
    const nL = Math.max(0, Math.floor(num(next[field], oL)));
    if (nL !== oL) flag('level_locked', `${field} ${oL} -> ${nL}; levels can only be awarded by the server`);
    next[field] = oL;
  }

  const oRings = Math.max(0, num(old.rings));
  let nRings = Math.max(0, Math.floor(num(next.rings, oRings)));
  const ringsAllowed = Math.min(LIMITS.RINGS_SINGLE, Math.max(0, LIMITS.RINGS_HOURLY - num(w.rg)));
  if (nRings - oRings > ringsAllowed) {
    flag('rings_jump', `rings ${oRings} -> ${nRings}`);
    nRings = oRings + ringsAllowed;
  }
  if (nRings > oRings) w.rg = num(w.rg) + (nRings - oRings);
  next.rings = nRings;

  for (const k of ['levelsCompleted', 'levelsUnder30', 'levelsUnder20']) {
    const o = num(oStats[k]);
    if (num(stats[k], o) > o) flag('stat_locked', `${k} can only be raised by the server`);
    stats[k] = o;
  }

  next.meta = next.meta && typeof next.meta === 'object' && !Array.isArray(next.meta) ? next.meta : {};
  const oEcho = old.meta && old.meta.echo && typeof old.meta.echo === 'object' ? old.meta.echo : {};
  next.meta.echo = next.meta.echo && typeof next.meta.echo === 'object' && !Array.isArray(next.meta.echo) ? next.meta.echo : {};
  const oEchoLevel = Math.max(0, Math.floor(num(oEcho.level)));
  if (num(next.meta.echo.level, oEchoLevel) !== oEchoLevel) flag('level_locked', 'echo level can only be raised by the server');
  next.meta.echo.level = oEchoLevel;

  for (const k of ['battleWins', 'battleLosses']) {
    const o = num(oStats[k]);
    let n = num(stats[k], o);
    if (n < o) n = o;
    const allowed = Math.min(1, Math.max(0, LIMITS.WINLOSS_HOURLY - num(w.wl)));
    if (n - o > allowed) {
      flag('battle_stat_jump', `${k} ${o} -> ${n}`);
      n = o + allowed;
    }
    if (n > o) w.wl = num(w.wl) + (n - o);
    stats[k] = n;
  }

  for (const mapKey of ITEM_MAPS) {
    const oMap = old[mapKey] && typeof old[mapKey] === 'object' ? old[mapKey] : {};
    const nMap = next[mapKey] && typeof next[mapKey] === 'object' && !Array.isArray(next[mapKey]) ? next[mapKey] : {};
    const added = Object.keys(nMap).filter((k) => !(k in oMap));
    const allowed = Math.min(LIMITS.ITEMS_SINGLE, Math.max(0, LIMITS.ITEMS_HOURLY - num(w.items)));
    if (added.length > allowed) {
      flag('items_jump', `${mapKey} +${added.length}, allowed +${allowed}`);
      added.slice(allowed).forEach((k) => delete nMap[k]);
    }
    w.items = num(w.items) + Math.min(added.length, allowed);
    next[mapKey] = nMap;
  }

  const b = next.battles && typeof next.battles === 'object' && !Array.isArray(next.battles) ? next.battles : {};
  const ob = old.battles && typeof old.battles === 'object' ? old.battles : {};
  const oldIncomingIds = new Set(toArr(ob.pendingIncoming).map((x) => x && x.id));
  b.pendingIncoming = toArr(b.pendingIncoming).filter((x) => x && oldIncomingIds.has(x.id));
  const oldOutgoingIds = new Set(toArr(ob.pendingOutgoing).map((x) => x && x.id));
  b.pendingOutgoing = toArr(b.pendingOutgoing).filter((x) => x && (oldOutgoingIds.has(x.id) || x.fromUserId === uid));
  b.logs = toArr(b.logs).slice(-LIMITS.MAX_LIST);
  b.active = null;
  next.battles = b;

  const f = next.friends && typeof next.friends === 'object' && !Array.isArray(next.friends) ? next.friends : {};
  const oldFriendIds = new Set(toArr(old.friends && old.friends.list).map((x) => x && x.userId));
  f.list = toArr(f.list).filter((x) => x && oldFriendIds.has(x.userId));
  delete f.incoming;
  delete f.outgoing;
  next.friends = f;

  return { state: next, clamped, guard: g };
}

function sanitizeSeason(oldVal, nextVal, guard, now) {
  const g = guard;
  const w = rollWindow(g, now);
  const o = oldVal && typeof oldVal === 'object' ? oldVal : null;
  if (!nextVal || typeof nextVal !== 'object') return null;
  let sp = num(nextVal.sp, NaN);
  if (!Number.isFinite(sp) || sp < 0) return null;
  sp = Math.min(LIMITS.SP_MAX, Math.floor(sp));
  const oSp = o ? num(o.sp) : 0;
  if (sp < oSp) sp = oSp;
  const allowed = Math.min(LIMITS.SP_SINGLE, Math.max(0, LIMITS.SP_HOURLY - num(w.sp)));
  if (sp - oSp > allowed) {
    addFlag(g, now, 'sp_jump', `sp ${oSp} -> ${sp}, allowed +${allowed}`);
    sp = oSp + allowed;
  }
  w.sp = num(w.sp) + Math.max(0, sp - oSp);
  const out = {
    sp,
    t: Math.max(0, Math.min(50, Math.floor(num(nextVal.t)))),
    n: String(nextVal.n || 'Carat').slice(0, 24),
    u: now
  };
  if (typeof nextVal.a === 'string' && nextVal.a.startsWith('./imgs/')) out.a = nextVal.a.slice(0, 200);
  return out;
}

module.exports = {
  LIMITS,
  num,
  clone,
  canon,
  same,
  toArr,
  rollWindow,
  addFlag,
  sanitizeOwnState,
  sanitizeSeason
};