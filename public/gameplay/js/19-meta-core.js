/* ──────────────────────────────────────────────────────────────────────────
   META LOOP — logic
   State lives in GAME_STATE.meta (one additive key in playerState):
     meta = {
       v, seeded,
       mastery: { [idolKey]: { xp } },
       season:  { id, num, sp, claimed:{t0..}, counted:{logId:1}, goals:{…}, day:{key,runs} },
       last:    { id, num, sp, tier, autoCoins, autoRings } | null
     }
   Every run feeds ONE pipeline: Meta.onRunComplete(game, info).
   ────────────────────────────────────────────────────────────────────────── */
const Meta = (() => {
  const D = META;
  const MAXLV = D.MASTERY_XP.length;
  const state = () => GAME_STATE.meta;

  // ── Season clock (HK time, Monday-based weeks) ────────────────────────────
  function seasonInfo(now = Date.now()) {
    const HK = 8 * 3600e3;
    const day = Math.floor((now + HK) / 86400e3);
    const startDay = day - ((day + 3) % 7);               // 1970-01-01 was a Thursday
    const num = Math.max(1, Math.floor((startDay - D.SEASON_ANCHOR_DAY) / 7) + 1);
    const startMs = startDay * 86400e3 - HK;
    return {
      id: 's' + startDay, num, startMs, endMs: startMs + 7 * 86400e3,
      name: D.SEASON_NAMES[(num - 1) % D.SEASON_NAMES.length],
    };
  }

  function fmtLeft(ms) {
    if (ms <= 0) return 'ending…';
    const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m % 60}m`;
  }

  // ── State normalisation (safe to call any time, never grants rewards) ─────
  function freshSeason(info) {
    return {
      id: info.id, num: info.num, sp: 0, claimed: {}, counted: {},
      goals: { runs: 0, wins: 0, passes: {}, claimed: {} }, day: { key: '', runs: 0 },
    };
  }

  function ensure() {
    if (!GAME_STATE.meta || typeof GAME_STATE.meta !== 'object') GAME_STATE.meta = {};
    const g = GAME_STATE.meta;
    g.v = D.VERSION;
    if (!g.mastery || typeof g.mastery !== 'object') g.mastery = {};
    if (!g.season || typeof g.season !== 'object' || !g.season.id) g.season = freshSeason(seasonInfo());
    const s = g.season;
    s.sp = Number(s.sp) || 0;
    s.claimed ||= {}; s.counted ||= {};
    s.goals ||= {};
    s.goals.runs = Number(s.goals.runs) || 0;
    s.goals.wins = Number(s.goals.wins) || 0;
    s.goals.passes ||= {}; s.goals.claimed ||= {};
    s.day ||= { key: '', runs: 0 };
    if (!g.seeded) seedFromLegacy();
    return g;
  }

  // Existing players keep their history: lifetime idol matches become starting XP.
  function seedFromLegacy() {
    const g = GAME_STATE.meta;
    const matches = GAME_STATE.stats?.idolMatches || {};
    ownedKeys().forEach(k => {
      if (g.mastery[k]) return;
      const xp = Math.min(Number(matches[k] || 0) * D.LEGACY_XP_PER_MATCH, D.LEGACY_XP_CAP);
      if (xp > 0) g.mastery[k] = { xp };
    });
    g.seeded = true;
  }

  function persist() { try { savePlayerState(); } catch (e) { console.warn('[Meta] save failed', e); } }
  const idolName = k => (IDOLS.find(i => i.key === k) || {}).display || k;

  // ── Idol Mastery ──────────────────────────────────────────────────────────
  function ownedKeys() { return Object.keys(GAME_STATE.ownedIdols || {}).filter(k => GAME_STATE.ownedIdols[k]); }
  function leadKey() { return (typeof getThemeIdolKey === 'function') ? getThemeIdolKey() : null; }
  function xpOf(k) { return Number(state().mastery[k]?.xp) || 0; }
  function levelFromXp(xp) { let l = 1; for (let i = 1; i < MAXLV; i++) if (xp >= D.MASTERY_XP[i]) l = i + 1; return l; }
  function levelOf(k) { return levelFromXp(xpOf(k)); }
  function progress(k) {
    const xp = xpOf(k), lv = levelFromXp(xp);
    if (lv >= MAXLV) return { lv, xp, cur: 0, need: 0, pct: 100, max: true };
    const lo = D.MASTERY_XP[lv - 1], hi = D.MASTERY_XP[lv];
    return { lv, xp, cur: xp - lo, need: hi - lo, pct: Math.round(((xp - lo) / (hi - lo)) * 100), max: false };
  }
  function fandomPower() { return ownedKeys().reduce((a, k) => a + levelOf(k), 0); }
  function coinBonusPct() { return Math.min(D.COIN_BONUS_CAP, fandomPower() * D.COIN_BONUS_PER_FP); }
  function leadSpBonus() { const k = leadKey(); return k ? Math.floor(levelOf(k) / D.SP.leadBonusEvery) : 0; }

  // Returns the list of new levels reached (each pays a one-off coin reward)
  function addXp(k, amt) {
    if (!k || amt <= 0 || !isIdolOwned(k)) return [];
    const g = state(), before = levelOf(k);
    const e = g.mastery[k] || (g.mastery[k] = { xp: 0 });
    e.xp = Math.min(99999, (Number(e.xp) || 0) + Math.round(amt));
    const after = levelOf(k), ups = [];
    for (let lv = before + 1; lv <= after; lv++) {
      addCoinsToGame(lv * D.LEVELUP_COINS_PER_LEVEL, 'mastery');
      ups.push(lv);
    }
    return ups;
  }

  // ── Season Points ─────────────────────────────────────────────────────────
  function tierOf(sp) { let t = 0; D.TIERS.forEach((x, i) => { if (sp >= x.sp) t = i + 1; }); return t; }
  function addSP(n) {
    n = Math.max(0, Math.round(n));
    if (!n) return 0;
    state().season.sp += n;
    publish();
    return n;
  }
  function claimableTiers() {
    const s = state().season, reached = tierOf(s.sp), out = [];
    for (let i = 0; i < reached; i++) if (!s.claimed['t' + i]) out.push(i);
    return out;
  }
  function goalValue(id) {
    const g = state().season.goals;
    return id === 'triple' ? Object.keys(g.passes).filter(k => g.passes[k]).length : (Number(g[id]) || 0);
  }
  function goalDone(def) { return goalValue(def.id) >= def.target; }
  function claimableGoals() { const g = state().season.goals; return D.GOALS.filter(d => goalDone(d) && !g.claimed[d.id]); }
  function claimableCount() { return claimableTiers().length + claimableGoals().length; }

  // Grants a tier reward; returns what was actually given (for summaries)
  function grantReward(r) {
    const given = { coins: 0, rings: 0, xp: 0 };
    if (r.coins) { addCoinsToGame(r.coins, 'season'); given.coins += r.coins; }
    if (r.rings) { GAME_STATE.rings = (GAME_STATE.rings || 0) + r.rings; given.rings += r.rings; }
    if (r.xp) {
      let k = leadKey();
      if (!k) { // no Lead idol: help the owned idol that is furthest from levelling
        k = ownedKeys().sort((a, b) => xpOf(a) - xpOf(b))[0] || null;
      }
      if (k) { addXp(k, r.xp); given.xp += r.xp; given.xpIdol = k; }
      else { addCoinsToGame(150, 'season'); given.coins += 150; }
    }
    return given;
  }

  function claimTier(i) {
    ensure();
    const s = state().season;
    if (!D.TIERS[i] || s.claimed['t' + i] || s.sp < D.TIERS[i].sp) return false;
    s.claimed['t' + i] = 1;
    const g = grantReward(D.TIERS[i].reward);
    persist();
    return g;
  }

  function claimGoal(id) {
    ensure();
    const def = D.GOALS.find(d => d.id === id), s = state().season;
    if (!def || s.goals.claimed[id] || !goalDone(def)) return false;
    s.goals.claimed[id] = 1;
    addSP(def.sp);
    persist();
    return def.sp;
  }

  // ── Season rollover: unclaimed tiers are auto-paid so nothing is ever lost ─
  function tick() {
    ensure();
    const info = seasonInfo(), g = state(), s = g.season;
    if (s.id === info.id) return false;
    const reached = tierOf(s.sp);
    let autoCoins = 0, autoRings = 0;
    for (let i = 0; i < reached; i++) {
      if (s.claimed['t' + i]) continue;
      const r = grantReward(D.TIERS[i].reward);
      autoCoins += r.coins; autoRings += r.rings;
    }
    g.last = { id: s.id, num: s.num, sp: s.sp, tier: reached, autoCoins, autoRings };
    g.season = freshSeason(info);
    persist();
    try {
      const extra = (autoCoins || autoRings) ? ` Auto-claimed ${autoCoins ? '+' + autoCoins + ' coins' : ''}${autoRings ? ' +' + autoRings + ' ring' : ''}.` : '';
      showToast(`Season ${g.last.num} ended at ${tierName(reached)}.${extra} Season ${info.num} begins!`, 'info');
    } catch (e) {}
    return true;
  }
  const tierName = n => n <= 0 ? 'Unranked' : D.TIERS[n - 1].name;

  // ── Battle results → SP (idempotent: scans logs, each log counts once) ────
  function syncBattles() {
    ensure();
    const me = currentUser?.id, s = state().season, info = seasonInfo();
    if (!me) return 0;
    let total = 0, wins = 0, n = 0;
    (GAME_STATE.battles?.logs || []).forEach(log => {
      if (!log || !log.id || s.counted[log.id]) return;
      if ((log.completedAt || 0) < info.startMs) return;
      let res;
      if (log.tie) res = 'tie';
      else if (log.winner?.userId) res = (log.winner.userId === me) ? 'win' : 'loss';
      else res = (log.winnerLabel === 'You') ? 'win' : 'loss';
      const sp = res === 'win' ? D.SP.win : res === 'tie' ? D.SP.tie : D.SP.loss;
      s.counted[log.id] = 1;
      total += addSP(sp); n++;
      if (res === 'win') { wins++; s.goals.wins++; }
    });
    if (n) {
      persist();
      try { showToast(`Battle result${n > 1 ? 's' : ''}: +${total} SP${wins ? ` (${wins} win${wins > 1 ? 's' : ''})` : ''}`, 'success'); } catch (e) {}
      try { Meta.ui && Meta.ui.refresh(); } catch (e) {}
    }
    return total;
  }

  // ── THE pipeline: every solo run of every game ends here ──────────────────
  // info = { passed, elite, coins, keys?:[idolKeys in deck], targetKey? }
  function onRunComplete(game, info = {}) {
    ensure(); tick();
    const s = state().season, parts = [];

    // counters / goals
    s.goals.runs++;
    if (info.passed) s.goals.passes[game] = true;

    // Season Points with the daily anti-grind curve
    const today = (typeof hkDayKey === 'function') ? hkDayKey() : String(new Date().toDateString());
    if (s.day.key !== today) s.day = { key: today, runs: 0 };
    let sp = info.passed ? D.SP.pass : D.SP.fail;
    if (info.passed && info.elite) sp += D.SP.elite;
    sp += leadSpBonus();
    if (s.day.runs >= D.SP.fullRunsPerDay) sp = D.SP.overflow;
    s.day.runs++;
    parts.push(`+${addSP(sp)} SP`);

    // Idol XP: Lead idol + every owned idol that took part
    const ups = [];
    const lead = leadKey();
    if (lead) ups.push(...addXp(lead, info.passed ? D.XP.leadPass : D.XP.leadFail).map(l => [lead, l]));
    const seen = new Set();
    (info.keys || []).forEach(k => {
      if (seen.has(k)) return; seen.add(k);
      ups.push(...addXp(k, info.passed ? D.XP.deckPass : D.XP.deckFail).map(l => [k, l]));
    });
    if (info.targetKey && info.passed) ups.push(...addXp(info.targetKey, D.XP.targetPass).map(l => [info.targetKey, l]));

    // Fandom Power coin bonus on the run's own coins
    const bonus = Math.floor((Number(info.coins) || 0) * coinBonusPct());
    if (bonus > 0) { addCoinsToGame(bonus, 'mastery'); parts.push(`+${bonus} fandom coins`); }

    syncBattles();
    try { showToast(parts.join(' · '), 'success'); } catch (e) {}
    ups.forEach(([k, lv], i) => setTimeout(() => {
      try { showToast(`${idolName(k)} Mastery Lv.${lv}! +${lv * D.LEVELUP_COINS_PER_LEVEL} coins`, 'success'); } catch (e) {}
    }, 900 * (i + 1)));
    try { Meta.ui && Meta.ui.refresh(); } catch (e) {}
    // caller (the existing result path) already saves; save here too in case it doesn't
    persist();
  }

  function afterRemoteApply() { ensure(); syncBattles(); try { Meta.ui && Meta.ui.refresh(); } catch (e) {} }

  // ── Ladder (public leaderboard under seasons/{id}/{uid}) ──────────────────
  let _pubTimer = null, _pubDenied = false;
  function safeAvatar(a) { return (typeof a === 'string' && a.startsWith('./imgs/')) ? a : './imgs/assets/default_avatar.png'; }
  function publish() {
    if (!db || !currentUser?.id || _pubDenied) return;
    clearTimeout(_pubTimer);
    _pubTimer = setTimeout(() => {
      try {
        const s = state().season;
        db.ref(`seasons/${s.id}/${currentUser.id}`).set({
          sp: s.sp, t: tierOf(s.sp),
          n: String(currentUser.displayName || currentUser.username || 'Carat').slice(0, 24),
          a: safeAvatar(equippedAvatarSrc()), u: Date.now(),
        }).catch(e => { _pubDenied = true; console.warn('[Meta] ladder write denied – see docs/DATABASE_RULES.md', e && e.code); });
      } catch (e) {}
    }, 1500);
  }

  // scope: 'global' | 'friends'. Never throws; returns { rows, error? }
  async function fetchLadder(scope) {
    ensure();
    const s = state().season, me = currentUser?.id;
    const mine = { uid: me, sp: s.sp, t: tierOf(s.sp), n: currentUser?.displayName || currentUser?.username || 'You', a: equippedAvatarSrc(), me: true };
    if (!db || !me) return { rows: [mine], error: 'offline' };
    try {
      let rows = [];
      if (scope === 'global') {
        const snap = await db.ref(`seasons/${s.id}`).orderByChild('sp').limitToLast(25).once('value');
        snap.forEach(c => { const v = c.val() || {}; rows.push({ uid: c.key, sp: Number(v.sp) || 0, t: Number(v.t) || 0, n: String(v.n || 'Carat'), a: safeAvatar(v.a) }); });
      } else {
        const friends = (GAME_STATE.friends?.list || []).filter(f => f && f.userId);
        const snaps = await Promise.all(friends.map(f => db.ref(`seasons/${s.id}/${f.userId}`).once('value').catch(() => null)));
        snaps.forEach((sn, i) => {
          const v = sn && sn.val(); const f = friends[i];
          rows.push({ uid: f.userId, sp: v ? Number(v.sp) || 0 : 0, t: v ? Number(v.t) || 0 : 0, n: String(f.displayName || f.username || 'Friend'), a: safeAvatar(v ? v.a : f.avatarSrc) });
        });
      }
      rows = rows.filter(r => r.uid !== me);
      rows.push(mine);                                    // always show live local SP for me
      rows.sort((a, b) => b.sp - a.sp);
      rows.forEach(r => { if (r.uid === me) r.me = true; });
      return { rows: rows.slice(0, 25) };
    } catch (e) {
      console.warn('[Meta] ladder read failed', e);
      return { rows: [mine], error: 'denied' };
    }
  }

  return {
    seasonInfo, fmtLeft, ensure, tick, syncBattles, onRunComplete, afterRemoteApply,
    levelOf, xpOf, progress, fandomPower, coinBonusPct, leadKey, leadSpBonus, ownedKeys, idolName,
    tierOf, tierName, claimTier, claimGoal, claimableTiers, claimableGoals, claimableCount,
    goalValue, goalDone, fetchLadder, publish, state, addXp, addSP, grantReward, safeAvatar, ui: null,
  };
})();
