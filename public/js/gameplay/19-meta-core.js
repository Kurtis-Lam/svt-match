// File: public/js/gameplay/19-meta-core.js
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
  let pendingSeasonMetaSave = false;

  // ── Calendar-month season clock; month boundaries use Hong Kong time ──
  function seasonInfo(now = Date.now()) {
    const HK = 8 * 3600e3;
    const local = new Date(now + HK);
    const year = local.getUTCFullYear();
    const monthIndex = local.getUTCMonth();
    const configStart = GAME_CONFIG.season?.startsOn || [2026, 1, 1];
    const anchorSerial = Number(configStart[0]) * 12 + Number(configStart[1]) - 1;
    const currentSerial = year * 12 + monthIndex;
    const num = Math.max(1, currentSerial - anchorSerial + 1);
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const startMs = Date.UTC(year, monthIndex, 1) - HK;
    const endMs = Date.UTC(year, monthIndex + 1, 1) - HK;
    return { id: `s${monthKey}`, monthKey, num, startMs, endMs };
  }

  function fmtLeft(ms) {
    if (ms <= 0) return 'ending…';
    const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m % 60}m`;
  }

  // ── State normalisation (safe to call any time, never grants rewards) ─────
  function freshSeason(info) {
    return {
      id: info.id, num: info.num, monthKey: info.monthKey, startMs: info.startMs, endMs: info.endMs,
      sp: 0, claimed: {}, counted: {}, boxes: 0,
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
    const activeInfo = seasonInfo();
    let seasonMetaChanged = false;
    if (s.id === activeInfo.id) {
      for (const [key, value] of Object.entries({ num: activeInfo.num, monthKey: activeInfo.monthKey, startMs: activeInfo.startMs, endMs: activeInfo.endMs })) {
        if (s[key] !== value) { s[key] = value; seasonMetaChanged = true; }
      }
    }
    s.sp = Number(s.sp) || 0;
    s.claimed ||= {}; s.counted ||= {};
    s.boxes = Math.max(0, Number(s.boxes) || 0);
    s.goals ||= {};
    s.goals.runs = Number(s.goals.runs) || 0;
    s.goals.wins = Number(s.goals.wins) || 0;
    s.goals.passes ||= {}; s.goals.claimed ||= {};
    s.day ||= { key: '', runs: 0 };
    if (!g.seeded) seedFromLegacy();
    if (seasonMetaChanged) pendingSeasonMetaSave = true;
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

  function persist() { pendingSeasonMetaSave = false; try { savePlayerState(); } catch (e) { console.warn('[Meta] save failed', e); } }
  function flushPendingSeasonMeta() { if (pendingSeasonMetaSave) persist(); }
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
      claimAwardSafe('mastery', { idolKey: k, level: lv }, true).then(() => { try { renderHub(); } catch (e) {} });
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
  function grantReward(r, serverPaid) {
    const given = { coins: 0, rings: 0, xp: 0, diamonds: 0, boxes: 0 };
    if (r.coins) given.coins += r.coins; // coins are paid by the server (see claimTier / tick)
    if (r.rings) { GAME_STATE.rings = (GAME_STATE.rings || 0) + r.rings; given.rings += r.rings; }
    if (r.diamonds) { GAME_STATE.diamonds = (GAME_STATE.diamonds || 0) + r.diamonds; given.diamonds += r.diamonds; }
    if (r.boxes) { state().season.boxes = (state().season.boxes || 0) + r.boxes; given.boxes += r.boxes; }
    if (r.xp) {
      let k = leadKey();
      if (!k) { // no Lead idol: help the owned idol that is furthest from levelling
        k = ownedKeys().sort((a, b) => xpOf(a) - xpOf(b))[0] || null;
      }
      if (k) { addXp(k, r.xp); given.xp += r.xp; given.xpIdol = k; }
    }
    return given;
  }

  async function claimTier(i) {
    ensure();
    const s = state().season;
    if (!D.TIERS[i] || s.claimed['t' + i] || s.sp < D.TIERS[i].sp) return false;
    const res = await claimAwardSafe('season', { tier: i });
    if (!res) return false;
    if (s.claimed['t' + i]) return false;
    if (res.extra && res.extra.alreadyClaimed) {
      s.claimed['t' + i] = 1;
      persist();
      return { alreadyClaimed: true };
    }
    s.claimed['t' + i] = 1;
    const g = grantReward(D.TIERS[i].reward, true);
    g.coins = Number(res.added) || 0;
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

  // ── Month rollover: rewards are never claimed automatically ──────────────
  function tick() {
    ensure();
    const info = seasonInfo(), g = state(), s = g.season;
    if (s.id === info.id) return false;
    const reached = tierOf(s.sp);
    g.last = {
      id: s.id, num: Number(s.num) || 0, monthKey: s.monthKey || '', sp: s.sp,
      tier: reached, claimed: { ...(s.claimed || {}) }, endedAt: info.startMs,
    };
    const nextSeason = freshSeason(info);
    nextSeason.boxes = Math.max(0, Number(s.boxes) || 0);
    g.season = nextSeason;
    persist();
    try { showToast(`Season ${g.last.num} ended. Season ${info.num} begins! Unclaimed rewards were not auto-claimed.`, 'info'); } catch (e) {}
    return true;
  }
  const tierName = n => n <= 0 ? 'Level 1' : (D.TIERS[n - 1]?.name || `Level ${Math.min(D.TIERS.length, n)}`);

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
      try { showToast(`Battle result${n > 1 ? 's' : ''}: +${total} Season XP${wins ? ` (${wins} win${wins > 1 ? 's' : ''})` : ''}`, 'success'); } catch (e) {}
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
    const seasonXpGained = addSP(sp);
    GAME_STATE.meta.lastRunXpGained = seasonXpGained;
    parts.push(`+${seasonXpGained} Season XP`);

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
    const bonus = Math.floor(Number(info.fandomCoins) || 0); // paid by the server with the run
    if (bonus > 0) parts.push(`+${Number(bonus).toLocaleString()} fandom coins`);

    syncBattles();
    try { showToast(parts.join(' · '), 'success'); } catch (e) {}
    ups.forEach(([k, lv], i) => setTimeout(() => {
      try { showToast(`${idolName(k)} Mastery Lv.${lv}! +${(lv * D.LEVELUP_COINS_PER_LEVEL).toLocaleString()} coins`, 'success'); } catch (e) {}
    }, 900 * (i + 1)));
    try { Meta.ui && Meta.ui.refresh(); } catch (e) {}
    // caller (the existing result path) already saves; save here too in case it doesn't
    persist();
    return seasonXpGained;
  }

  function afterRemoteApply() { ensure(); syncBattles(); try { Meta.ui && Meta.ui.refresh(); } catch (e) {} }

  return {
    seasonInfo, fmtLeft, ensure, tick, syncBattles, onRunComplete, afterRemoteApply, flushPendingSeasonMeta,
    levelOf, xpOf, progress, fandomPower, coinBonusPct, leadKey, leadSpBonus, ownedKeys, idolName,
    tierOf, tierName, claimTier, claimGoal, claimableTiers, claimableGoals, claimableCount,
    goalValue, goalDone, state, addXp, addSP, grantReward, ui: null,
  };
})();