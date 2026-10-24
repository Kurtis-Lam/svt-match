// File: api/_lib/awards.js
const crypto = require('crypto');
const { httpError } = require('./http');
const G = require('./guard');
const { db, txn, userExists } = require('./gateway');

const { num, toArr } = G;

const HOUR_MS = 3600000;
const HK_MS = 8 * HOUR_MS;

const RULES = {
  showtime: {
    passSeconds: 30,
    streakSeconds: 20,
    minSeconds: 3,
    maxSeconds: 3600,
    base: 100,
    streakPer: 10,
    kkuma: 5000,
    rarity: { rare: 10, superrare: 20, epic: 50, mythic: 100, legendary: 500 },
    maxPairs: 12,
    idolBonusCap: 1000,
    minGapMs: 4000
  },
  spotlight: {
    passHits: 5,
    streakHits: 7,
    perHit: 100,
    perMiss: 50,
    streakPer: 10,
    kkuma: 5000,
    maxHits: 40,
    minGapMs: 6000
  },
  snakeventeen: {
    passEaten: 4,
    streakLength: 9,
    perLength: 75,
    streakPer: 10,
    minLength: 3,
    maxLength: 103,
    maxEaten: 100,
    minGapMs: 5000
  },
  echo: {
    passRounds: 5,
    eliteRounds: 7,
    setRounds: 9,
    perRound: 70,
    perfect: 150,
    streakPer: 10,
    maxRounds: 60,
    minGapMs: 8000
  },
  fandomCap: 0.25,
  kkumaBucket: { cap: 3, refillMs: 10 * 60 * 1000 },
  dailyBox: {
    maxPerDay: 6,
    upgrade: { 1: 0.5, 2: 0.44, 3: 0.3182, 4: 0.2857 },
    coins: { 1: 100, 2: 200, 3: 500, 4: 1000, 5: 5000 },
    attempts: 4
  },
  wheel: [1000, 750, 500, 250, 100, 50, 25, 10],
  offline: { tickMs: 30 * 60 * 1000, maxTicks: 48, minLove: 5, maxLove: 100, top: 3, mult: 51, exp: 1.4, ticksExp: 0.75, cap: 250000 },
  mastery: { perLevel: 100, minLevel: 2, maxLevel: 10, maxIdols: 40 },
  season: {
    sp: { pass: 10, fail: 3, elite: 5, overflow: 1, fullRunsPerDay: 12, maxLeadBonus: 2, goalSp: 150, goalRuns: 25, goalWins: 3, perBattle: 40 },
    anchorYear: 2026,
    anchorMonth: 1,
    levels: [
      { sp: 0, coins: 100 },
      { sp: 25, boxes: 1 },
      { sp: 60, coins: 300 },
      { sp: 105, diamonds: 1 },
      { sp: 160, boxes: 1 },
      { sp: 225, coins: 500 },
      { sp: 300, diamonds: 1 },
      { sp: 385, boxes: 1 },
      { sp: 480, coins: 750 },
      { sp: 585, diamonds: 2 },
      { sp: 700, boxes: 1 },
      { sp: 825, coins: 1000 },
      { sp: 960, diamonds: 2 },
      { sp: 1105, boxes: 1 },
      { sp: 1260, coins: 1500 },
      { sp: 1425, diamonds: 3 },
      { sp: 1600, boxes: 2, diamonds: 4, coins: 2500 }
    ]
  },
  quests: {
    idol: {
      tiers: [5, 10, 20, 50, 100, 250, 500, 1000],
      coins: { 5: 50, 10: 100, 20: 250, 50: 750, 100: 1500, 250: 4000, 500: 9000, 1000: 20000 },
      leniency: 0.7
    },
    timed: {
      fast: { tiers: [1, 5, 10, 50, 100, 250, 500, 1000], coins: { 1: 50, 5: 100, 10: 250, 50: 500, 100: 1000, 250: 3000, 500: 7000, 1000: 15000 } },
      blitz: { tiers: [1, 5, 10, 25, 50, 75, 100, 250, 500, 1000], coins: { 1: 100, 5: 500, 10: 1000, 25: 2500, 50: 5000, 75: 7500, 100: 10000, 250: 25000, 500: 55000, 1000: 120000 } }
    },
    tiered: {
      showtime_levels: { stat: 'level', tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      spotlight_levels: { stat: 'spotlightLevel', tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      spotlight_hits: { stat: 'bestHits', tiers: [5, 8, 10, 12, 15, 20], rewards: [100, 300, 600, 1200, 3000, 8000] },
      snake_levels: { stat: 'snakeventeenLevel', tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      snake_length: { stat: 'snakeLongest', tiers: [6, 9, 12, 16, 20, 25, 30], rewards: [100, 300, 700, 1500, 3500, 8000, 20000] },
      echo_levels: { stat: 'echoLevel', tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      echo_rounds: { stat: 'echoBest', tiers: [5, 7, 9, 12, 15, 20, 30], rewards: [100, 300, 700, 1500, 3500, 8000, 20000] }
    },
    daily: {
      dq_showtime: { game: 'showtime', metric: 'passes', target: 2, coins: 30 },
      dq_spotlight: { game: 'spotlight', metric: 'passes', target: 2, coins: 30 },
      dq_snake: { game: 'snakeventeen', metric: 'passes', target: 2, coins: 30 },
      dq_echo: { game: 'echo', metric: 'runs', target: 2, coins: 30 },
      dq_any_runs: { game: 'any', metric: 'runs', target: 5, coins: 50 }
    }
  }
};

const GAMES = ['showtime', 'spotlight', 'snakeventeen', 'echo'];
const KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;

function dayKey(now) {
  return new Date(now + HK_MS).toISOString().slice(0, 10);
}

function seasonInfo(now) {
  const local = new Date(now + HK_MS);
  const year = local.getUTCFullYear();
  const monthIndex = local.getUTCMonth();
  const anchorSerial = Number(RULES.season.anchorYear) * 12 + Number(RULES.season.anchorMonth) - 1;
  const currentSerial = year * 12 + monthIndex;
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return {
    id: `s${monthKey}`,
    monthKey,
    num: Math.max(1, currentSerial - anchorSerial + 1),
  };
}

function seasonId(now) {
  return seasonInfo(now).id;
}

function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function int(v, lo, hi, what) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw httpError(400, 'Invalid ' + what);
  const f = Math.floor(n);
  if (f < lo || f > hi) throw httpError(400, 'Invalid ' + what);
  return f;
}

function seedLedger(ps, now) {
  const s = obj(ps);
  const stats = obj(s.stats);
  const meta = obj(s.meta);
  const echo = obj(meta.echo);
  const season = obj(meta.season);
  const im = {};
  const src = obj(stats.idolMatches);
  Object.keys(src).slice(0, 60).forEach((k) => {
    if (KEY_RE.test(k)) im[k] = Math.max(0, Math.min(100000, Math.floor(num(src[k]))));
  });
  const a = {
    v: 1,
    sk: { showtime: 0, spotlight: 0, snakeventeen: 0, echo: 0 },
    last: {},
    kb: { n: RULES.kkumaBucket.cap, t: now },
    c: {
      s30: Math.max(0, Math.floor(num(stats.levelsUnder30))),
      s20: Math.max(0, Math.floor(num(stats.levelsUnder20))),
      bestHits: Math.max(0, Math.floor(num(stats.spotlightBestCorrect))),
      snakeLongest: Math.max(0, Math.floor(num(stats.snakeventeenLongestLength))),
      echoBest: Math.max(0, Math.floor(num(echo.bestRounds))),
      im
    },
    day: { k: dayKey(now), runs: {}, passes: {}, boxes: 0, wheel: 0, dq: {} },
    sb: Math.max(0, Math.min(40, Math.floor(num(season.boxes)))),
    se: { id: seasonId(now), claimed: {}, sp: 0, runs: 0, passed: {} },
    ma: {},
    ol: 0
  };
  if (season.id === a.se.id) a.se.sp = Math.max(0, Math.min(20000, Math.floor(num(season.sp))));
  if (season.id === a.se.id && season.claimed && typeof season.claimed === 'object') {
    Object.keys(season.claimed).slice(0, 40).forEach((k) => {
      if (season.claimed[k] && /^t\d{1,2}$/.test(k)) a.se.claimed[k] = 1;
    });
  }
  return a;
}

function normalizeLedger(a, now) {
  const L = a && typeof a === 'object' ? a : null;
  if (!L) return null;
  L.sk = obj(L.sk);
  L.last = obj(L.last);
  L.kb = obj(L.kb);
  L.c = obj(L.c);
  L.c.im = obj(L.c.im);
  L.day = obj(L.day);
  L.se = obj(L.se);
  L.ma = obj(L.ma);
  const dk = dayKey(now);
  if (L.day.k !== dk) L.day = { k: dk, runs: {}, passes: {}, boxes: 0, wheel: 0, dq: {} };
  L.day.runs = obj(L.day.runs);
  L.day.passes = obj(L.day.passes);
  L.day.dq = obj(L.day.dq);
  const activeSeason = seasonInfo(now);
  const sid = activeSeason.id;
  if (L.se.id !== sid) {
    L.prevSe = { id: L.se.id, num: Number(L.se.num) || 0, claimed: obj(L.se.claimed), sp: num(L.se.sp) };
    L.se = { id: sid, num: activeSeason.num, monthKey: activeSeason.monthKey, claimed: {}, sp: 0, runs: 0, passed: {} };
  } else {
    L.se.num = activeSeason.num;
    L.se.monthKey = activeSeason.monthKey;
  }
  L.se.claimed = obj(L.se.claimed);
  L.se.sp = num(L.se.sp);
  L.se.runs = num(L.se.runs);
  L.se.passed = obj(L.se.passed);
  if (L.prevSe) {
    L.prevSe = obj(L.prevSe);
    L.prevSe.claimed = obj(L.prevSe.claimed);
  }
  L.sb = Math.max(0, Math.floor(num(L.sb)));
  L.ol = num(L.ol);
  return L;
}

function takeKkuma(L, now) {
  const b = RULES.kkumaBucket;
  const k = L.kb;
  const n = Math.min(b.cap, num(k.n, b.cap) + Math.max(0, now - num(k.t, now)) / b.refillMs);
  if (n >= 1) {
    L.kb = { n: n - 1, t: now };
    return true;
  }
  L.kb = { n, t: now };
  return false;
}

function gate(L, game, now, minGap) {
  const last = num(L.last[game]);
  if (last && now - last < minGap) throw httpError(429, 'Too fast. Try again in a moment.');
  L.last[game] = now;
}

function noteRun(L, game, passed, elite, ctx) {
  const S = RULES.season.sp;
  const runsToday = GAMES.reduce((n, g) => n + num(L.day.runs[g]), 0);
  L.day.runs[game] = num(L.day.runs[game]) + 1;
  if (passed) L.day.passes[game] = num(L.day.passes[game]) + 1;
  const lead = Math.max(0, Math.min(S.maxLeadBonus, Math.floor(num(obj(ctx).leadBonus))));
  let sp = passed ? S.pass : S.fail;
  if (passed && elite) sp += S.elite;
  sp += lead;
  if (runsToday >= S.fullRunsPerDay) sp = S.overflow;
  L.se.sp = Math.min(20000, num(L.se.sp) + sp);
  L.se.runs = num(L.se.runs) + 1;
  if (passed) L.se.passed[game] = 1;
}

function fandom(ctx, runCoins) {
  const pct = Math.max(0, Math.min(RULES.fandomCap, num(ctx.fandomPct)));
  return Math.floor(runCoins * pct);
}

function awardShowtime(L, ctx, now) {
  const R = RULES.showtime;
  const t = Number(ctx.timeSec);
  if (!Number.isFinite(t) || t < R.minSeconds || t > R.maxSeconds) throw httpError(400, 'Invalid level time');
  gate(L, 'showtime', now, R.minGapMs);
  const passed = t <= R.passSeconds;
  const elite = t < R.streakSeconds;
  L.sk.showtime = elite ? num(L.sk.showtime) + 1 : 0;
  const streakBonus = elite ? L.sk.showtime * R.streakPer : 0;
  const pairs = obj(ctx.pairs);
  let idolBonus = 0;
  let counted = 0;
  for (const key of Object.keys(pairs)) {
    if (!KEY_RE.test(key) || key === 'kkuma') continue;
    if (++counted > R.maxPairs) break;
    idolBonus += R.rarity[pairs[key]] || 0;
    L.c.im[key] = Math.min(100000, num(L.c.im[key]) + 1);
  }
  idolBonus = Math.min(idolBonus, R.idolBonusCap);
  const kkumaBonus = ctx.kkuma === true && takeKkuma(L, now) ? R.kkuma : 0;
  const runCoins = R.base + streakBonus + idolBonus + kkumaBonus;
  const fandomCoins = fandom(ctx, runCoins);
  if (t <= 30) L.c.s30 = num(L.c.s30) + 1;
  if (t <= 20) L.c.s20 = num(L.c.s20) + 1;
  noteRun(L, 'showtime', passed, elite, ctx);
  return {
    coins: runCoins + fandomCoins,
    levelField: passed ? 'level' : null,
    counts: { levelsCompleted: 1, levelsUnder30: t <= 30 ? 1 : 0, levelsUnder20: t <= 20 ? 1 : 0 },
    extra: { passed, elite, streak: L.sk.showtime, base: R.base, streakBonus, idolBonus, kkumaBonus, fandomCoins, runCoins }
  };
}

function awardSpotlight(L, ctx, now) {
  const R = RULES.spotlight;
  const correct = int(ctx.correct, 0, R.maxHits, 'hit count');
  const wrong = int(ctx.wrong, 0, R.maxHits, 'miss count');
  gate(L, 'spotlight', now, R.minGapMs);
  const passed = correct >= R.passHits;
  L.sk.spotlight = correct >= R.streakHits ? num(L.sk.spotlight) + 1 : 0;
  L.c.bestHits = Math.max(num(L.c.bestHits), correct);
  const streakBonus = L.sk.spotlight * R.streakPer;
  const kkumaBonus = ctx.kkuma === true && takeKkuma(L, now) ? R.kkuma : 0;
  const net = correct * R.perHit - wrong * R.perMiss;
  const runCoins = Math.max(0, net + streakBonus + kkumaBonus);
  const fandomCoins = fandom(ctx, runCoins);
  noteRun(L, 'spotlight', passed, correct >= R.streakHits, ctx);
  return {
    coins: runCoins + fandomCoins,
    levelField: passed ? 'spotlightLevel' : null,
    counts: {},
    extra: { passed, elite: correct >= R.streakHits, streak: L.sk.spotlight, net, streakBonus, kkumaBonus, fandomCoins, runCoins }
  };
}

function awardSnake(L, ctx, now) {
  const R = RULES.snakeventeen;
  const length = int(ctx.length, R.minLength, R.maxLength, 'snake length');
  const eaten = int(ctx.eaten, 0, R.maxEaten, 'idols eaten');
  gate(L, 'snakeventeen', now, R.minGapMs);
  const passed = eaten >= R.passEaten;
  L.sk.snakeventeen = length >= R.streakLength ? num(L.sk.snakeventeen) + 1 : 0;
  L.c.snakeLongest = Math.max(num(L.c.snakeLongest), length);
  const lengthCoins = length * R.perLength;
  const streakBonus = L.sk.snakeventeen * R.streakPer;
  const runCoins = lengthCoins + streakBonus;
  const fandomCoins = fandom(ctx, runCoins);
  noteRun(L, 'snakeventeen', passed, length >= R.streakLength, ctx);
  return {
    coins: runCoins + fandomCoins,
    levelField: passed ? 'snakeventeenLevel' : null,
    counts: {},
    extra: { passed, elite: length >= R.streakLength, streak: L.sk.snakeventeen, lengthCoins, streakBonus, fandomCoins, runCoins }
  };
}

function awardEcho(L, ctx, now) {
  const R = RULES.echo;
  const rounds = int(ctx.rounds, 0, R.maxRounds, 'round count');
  const mode = ctx.mode === 'endless' ? 'endless' : 'set';
  gate(L, 'echo', now, R.minGapMs);
  const passed = rounds >= R.passRounds;
  const elite = rounds >= R.eliteRounds;
  const perfect = mode === 'set' && ctx.perfect === true && rounds >= R.setRounds;
  if (mode === 'set') L.sk.echo = elite ? num(L.sk.echo) + 1 : 0;
  else L.sk.echo = num(L.sk.echo);
  L.c.echoBest = Math.max(num(L.c.echoBest), rounds);
  const base = rounds * R.perRound + (perfect ? R.perfect : 0);
  const streakBonus = L.sk.echo * R.streakPer;
  const runCoins = base + streakBonus;
  const fandomCoins = fandom(ctx, runCoins);
  noteRun(L, 'echo', passed, elite, ctx);
  return {
    coins: runCoins + fandomCoins,
    levelField: null,
    echoLevel: passed ? 1 : 0,
    counts: {},
    extra: { passed, elite, streak: L.sk.echo, base, streakBonus, fandomCoins, runCoins, perfect }
  };
}

function anyPasses(L) {
  return num(L.day.runs.showtime) + ['spotlight', 'snakeventeen', 'echo'].reduce((s, g) => s + num(L.day.passes[g]), 0);
}

function awardDailyBox(L, ctx, now) {
  const R = RULES.dailyBox;
  const via = ctx.via === 'season' ? 'season' : 'daily';
  if (via === 'daily') {
    if (num(L.day.boxes) >= R.maxPerDay) throw httpError(409, 'No daily boxes left today');
    if (num(L.day.boxes) >= anyPasses(L)) throw httpError(409, 'No daily box is ready');
    L.day.boxes = num(L.day.boxes) + 1;
  } else {
    if (num(L.sb) < 1) throw httpError(409, 'No season boxes left');
    L.sb = num(L.sb) - 1;
  }
  let star = 1;
  for (let i = 0; i < R.attempts && star < 5; i++) {
    const roll = crypto.randomInt(0, 1000000) / 1000000;
    if (roll < (R.upgrade[star] || 0)) star++;
  }
  return { coins: R.coins[star], extra: { star, via, boxesToday: L.day.boxes, seasonBoxes: L.sb } };
}

function awardWheel(L) {
  if (num(L.day.wheel) >= 1) throw httpError(409, 'The wheel was already spun today');
  L.day.wheel = 1;
  const prize = RULES.wheel[crypto.randomInt(0, RULES.wheel.length)];
  return { coins: prize, extra: { prize } };
}

function awardQuest(L, ctx, now, ps) {
  const Q = RULES.quests;
  const kind = String(ctx.kind || '');
  if (kind === 'daily') {
    const id = String(ctx.id || '');
    const def = Q.daily[id];
    if (!def) throw httpError(400, 'Unknown quest');
    if (L.day.dq[id]) return { coins: 0, extra: { kind, id, alreadyClaimed: true } };
    const src = def.metric === 'passes' ? L.day.passes : L.day.runs;
    const progress = def.game === 'any' ? GAMES.reduce((s, g) => s + num(src[g]), 0) : num(src[def.game]);
    if (progress < def.target) throw httpError(403, 'Quest is not complete');
    L.day.dq[id] = 1;
    return { coins: def.coins, extra: { kind, id } };
  }

  const claimKey = (k) => {
    L.ma.q = obj(L.ma.q);
    if (L.ma.q[k]) return false;
    if (Object.keys(L.ma.q).length > 400) throw httpError(400, 'Too many claims');
    L.ma.q[k] = 1;
    return true;
  };

  if (kind === 'idol') {
    const key = String(ctx.idolKey || '');
    const tier = int(ctx.tier, 1, 1000, 'tier');
    if (!KEY_RE.test(key) || !Q.idol.tiers.includes(tier)) throw httpError(400, 'Unknown quest');
    const claimId = `i:${key}:${tier}`;
    L.ma.q = obj(L.ma.q);
    if (L.ma.q[claimId]) return { coins: 0, extra: { kind, key, tier, alreadyClaimed: true } };
    const have = num(L.c.im[key]);
    if (have < Math.ceil(tier * Q.idol.leniency)) throw httpError(403, 'Quest is not complete');
    if (!claimKey(claimId)) return { coins: 0, extra: { kind, key, tier, alreadyClaimed: true } };
    return { coins: Q.idol.coins[tier], extra: { kind, key, tier } };
  }

  if (kind === 'fast' || kind === 'blitz') {
    const def = Q.timed[kind];
    const tier = int(ctx.tier, 1, 1000, 'tier');
    if (!def.tiers.includes(tier)) throw httpError(400, 'Unknown quest');
    const claimId = `${kind}:${tier}`;
    L.ma.q = obj(L.ma.q);
    if (L.ma.q[claimId]) return { coins: 0, extra: { kind, tier, alreadyClaimed: true } };
    const have = num(kind === 'fast' ? L.c.s30 : L.c.s20);
    if (have < tier) throw httpError(403, 'Quest is not complete');
    if (!claimKey(claimId)) return { coins: 0, extra: { kind, tier, alreadyClaimed: true } };
    return { coins: def.coins[tier], extra: { kind, tier } };
  }

  if (kind === 'tiered') {
    const id = String(ctx.id || '');
    const def = Q.tiered[id];
    const tier = int(ctx.tier, 1, 1000, 'tier');
    if (!def) throw httpError(400, 'Unknown quest');
    const idx = def.tiers.indexOf(tier);
    if (idx < 0) throw httpError(400, 'Unknown quest');
    const claimId = `t:${id}:${tier}`;
    L.ma.q = obj(L.ma.q);
    if (L.ma.q[claimId]) return { coins: 0, extra: { kind, id, tier, alreadyClaimed: true } };
    const s = obj(ps);
    const echo = obj(obj(s.meta).echo);
    const stats = {
      level: num(s.level),
      spotlightLevel: num(s.spotlightLevel),
      snakeventeenLevel: num(s.snakeventeenLevel),
      echoLevel: num(echo.level),
      bestHits: num(L.c.bestHits),
      snakeLongest: num(L.c.snakeLongest),
      echoBest: num(L.c.echoBest)
    };
    if (stats[def.stat] < tier) throw httpError(403, 'Quest is not complete');
    if (!claimKey(claimId)) return { coins: 0, extra: { kind, id, tier, alreadyClaimed: true } };
    return { coins: def.rewards[idx], extra: { kind, id, tier } };
  }

  throw httpError(400, 'Unknown quest');
}

function awardSeason(L, ctx, now, ps) {
  const tier = int(ctx.tier, 0, RULES.season.levels.length - 1, 'tier');
  const def = RULES.season.levels[tier];
  const key = 't' + tier;
  const prev = ctx.prev === true;
  const se = prev ? L.prevSe : L.se;
  if (!se) throw httpError(409, 'No season to claim from');
  if (se.claimed[key]) throw httpError(409, 'Reward already claimed');
  const stats = obj(obj(ps).stats);
  const battleAllowance = (num(stats.battleWins) + num(stats.battleLosses)) * RULES.season.sp.perBattle;
  const S = RULES.season.sp;
  let goals = 0;
  if (num(se.runs) >= S.goalRuns) goals += S.goalSp;
  if (num(stats.battleWins) >= S.goalWins) goals += S.goalSp;
  if (GAMES.every((g) => obj(se.passed)[g])) goals += S.goalSp;
  const reachable = num(se.sp) + battleAllowance + goals;
  if (reachable < def.sp) throw httpError(403, 'Season tier not reached');
  se.claimed[key] = 1;
  if (def.boxes) L.sb = num(L.sb) + def.boxes;
  return { coins: def.coins || 0, extra: { tier, boxes: def.boxes || 0, diamonds: def.diamonds || 0, seasonBoxes: L.sb, prev } };
}

function awardMastery(L, ctx) {
  const R = RULES.mastery;
  const key = String(ctx.idolKey || '');
  const lv = int(ctx.level, R.minLevel, R.maxLevel, 'level');
  if (!KEY_RE.test(key)) throw httpError(400, 'Invalid idol');
  L.ma.m = obj(L.ma.m);
  const k = `${key}:${lv}`;
  if (L.ma.m[k]) throw httpError(409, 'Mastery reward already claimed');
  if (Object.keys(L.ma.m).length >= R.maxIdols * (R.maxLevel - 1)) throw httpError(400, 'Too many claims');
  L.ma.m[k] = 1;
  return { coins: lv * R.perLevel, extra: { idolKey: key, level: lv } };
}

function awardOffline(L, ctx, now, ps) {
  const R = RULES.offline;
  const since = L.ol > 0 ? num(L.ol) : now - R.maxTicks * R.tickMs;
  const elapsed = now - since;
  if (elapsed < R.tickMs) throw httpError(409, 'Nothing to claim yet');
  const intervals = Math.min(R.maxTicks, Math.floor(elapsed / R.tickMs));
  const s = obj(ps);
  const married = obj(s.marriedIdols);
  const love = obj(s.love);
  const levels = Object.keys(married)
    .filter((k) => married[k] && KEY_RE.test(k))
    .map((k) => Math.max(1, Math.min(R.maxLove, Math.floor(num(obj(love[k]).level, 1)))))
    .sort((x, y) => y - x)
    .slice(0, R.top);
  let total = 0;
  for (const lv of levels) {
    if (lv < R.minLove) continue;
    const per = Math.floor(Math.pow(lv, R.exp) * R.mult);
    total += Math.floor(per * Math.pow(intervals, R.ticksExp));
  }
  total = Math.min(R.cap, total);
  L.ol = now;
  return { coins: total, extra: { intervals } };
}

const HANDLERS = {
  showtime: awardShowtime,
  spotlight: awardSpotlight,
  snakeventeen: awardSnake,
  echo: awardEcho,
  dailybox: awardDailyBox,
  dailywheel: awardWheel,
  quest: awardQuest,
  season: awardSeason,
  mastery: awardMastery,
  offlinelove: awardOffline
};

function valuesOf(state) {
  const s = obj(state);
  const stats = obj(s.stats);
  const echo = obj(obj(s.meta).echo);
  return {
    coins: num(s.coins),
    level: num(s.level),
    spotlightLevel: num(s.spotlightLevel),
    snakeventeenLevel: num(s.snakeventeenLevel),
    echoLevel: num(echo.level),
    totalCoinsEarned: num(stats.totalCoinsEarned),
    levelsCompleted: num(stats.levelsCompleted),
    levelsUnder30: num(stats.levelsUnder30),
    levelsUnder20: num(stats.levelsUnder20)
  };
}

async function processAward(uid, body) {
  const source = body && typeof body.source === 'string' ? body.source : '';
  const ctx = obj(body && body.ctx);
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, source) ? HANDLERS[source] : null;
  if (!handler) throw httpError(400, 'Unknown award source');
  if (!(await userExists(uid))) throw httpError(404, 'Profile not found');
  const now = Date.now();

  const psSnap = await db().ref(`users/${uid}/playerState`).once('value');
  const ps = psSnap.val() || {};

  const ledger0 = (await db().ref(`guard/${uid}/a`).once('value')).val();
  let outcome = null;
  const ledger = await txn(`guard/${uid}/a`, (cur) => {
    const base = cur !== null && cur !== undefined ? cur : ledger0;
    const L = normalizeLedger(base ? JSON.parse(JSON.stringify(base)) : seedLedger(ps, now), now);
    outcome = handler(L, ctx, now, ps);
    return JSON.parse(JSON.stringify(L));
  });
  if (!ledger.committed || !outcome) throw httpError(409, 'Award could not be applied. Try again.');

  const coins = Math.max(0, Math.floor(num(outcome.coins)));
  let stateValues = null;
  let coinsBefore = 0;
  let totalCoinsEarnedBefore = 0;
  const r = await txn(`users/${uid}/playerState`, (cur) => {
    const st = cur && typeof cur === 'object' ? JSON.parse(JSON.stringify(cur)) : {};
    st.stats = obj(st.stats);
    coinsBefore = Math.max(0, Math.floor(num(st.coins)));
    totalCoinsEarnedBefore = Math.max(0, num(st.stats.totalCoinsEarned));
    st.coins = coinsBefore + coins;
    st.stats.totalCoinsEarned = totalCoinsEarnedBefore + coins;
    if (outcome.levelField) st[outcome.levelField] = Math.max(0, Math.floor(num(st[outcome.levelField]))) + 1;
    const counts = obj(outcome.counts);
    for (const k of Object.keys(counts)) st.stats[k] = Math.max(0, num(st.stats[k])) + num(counts[k]);
    if (outcome.echoLevel) {
      st.meta = obj(st.meta);
      st.meta.echo = obj(st.meta.echo);
      st.meta.echo.level = Math.max(0, Math.floor(num(st.meta.echo.level))) + 1;
    }
    st.updatedAt = now;
    stateValues = valuesOf(st);
    return st;
  });
  if (!r.committed) throw httpError(409, 'Award could not be saved. Try again.');
  if (!(await userExists(uid))) {
    await db().ref(`users/${uid}/playerState`).remove().catch(() => {});
    throw httpError(404, 'Profile not found');
  }
  if (coins > 0) {
    const values = stateValues || valuesOf(r.value);
    const historyRef = db().ref(`adminPlayerHistory/${uid}/earningsHistory`).push();
    await historyRef.set({
      at: now,
      type: 'earning',
      source,
      amount: coins,
      coinsBefore,
      coinsAfter: Number(values.coins) || (coinsBefore + coins),
      totalCoinsEarnedBefore,
      totalCoinsEarnedAfter: Number(values.totalCoinsEarned) || (totalCoinsEarnedBefore + coins),
      detail: outcome.extra || {}
    }).catch((e) => console.error('[earnings-history] failed:', e && e.message));
  }
  return { ok: true, source, added: coins, extra: outcome.extra || {}, values: stateValues || valuesOf(r.value) };
}

module.exports = { processAward, RULES, seasonId, seasonInfo, dayKey, seedLedger };