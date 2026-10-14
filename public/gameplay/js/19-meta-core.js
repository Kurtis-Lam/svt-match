/* SVT MATCH progression core: idol mastery plus the 17-level Season Pass. */
const Meta = (() => {
  const D = META;
  const SP = GAME_CONFIG.seasonPass;
  const MAXLV = D.MASTERY_XP.length;
  const state = () => GAME_STATE.meta;
  const idolName = k => (IDOLS.find(i => i.key === k) || {}).display || k;

  function ownedKeys() {
    return Object.keys(GAME_STATE.ownedIdols || {}).filter(k => GAME_STATE.ownedIdols[k]);
  }
  function leadKey() {
    return (typeof getThemeIdolKey === 'function') ? getThemeIdolKey() : null;
  }
  function xpOf(k) { return Number(state().mastery?.[k]?.xp) || 0; }
  function levelFromXp(xp) {
    let l = 1;
    for (let i = 1; i < MAXLV; i++) if (xp >= D.MASTERY_XP[i]) l = i + 1;
    return l;
  }
  function levelOf(k) { return levelFromXp(xpOf(k)); }
  function progress(k) {
    const xp = xpOf(k), lv = levelFromXp(xp);
    if (lv >= MAXLV) return { lv, xp, cur: 0, need: 0, pct: 100, max: true };
    const lo = D.MASTERY_XP[lv - 1], hi = D.MASTERY_XP[lv];
    return { lv, xp, cur: xp - lo, need: hi - lo, pct: Math.round(((xp - lo) / (hi - lo)) * 100), max: false };
  }
  function fandomPower() { return ownedKeys().reduce((a, k) => a + levelOf(k), 0); }
  function coinBonusPct() { return Math.min(D.COIN_BONUS_CAP, fandomPower() * D.COIN_BONUS_PER_FP); }

  function totalPassXp() {
    return SP.levels.reduce((sum, level) => sum + Math.max(1, Number(level.xpRequired) || 1), 0);
  }
  function passThreshold(levelNumber) {
    return SP.levels.slice(0, Math.max(0, levelNumber)).reduce((sum, level) => sum + Math.max(1, Number(level.xpRequired) || 1), 0);
  }
  function passLevelFromXp(xp) {
    let level = 0;
    for (let i = 1; i <= SP.levels.length; i++) {
      if (xp >= passThreshold(i)) level = i;
      else break;
    }
    return level;
  }
  function passInfo() {
    const g = state(), pass = g.pass;
    const xp = Math.max(0, Number(pass.xp) || 0);
    const level = passLevelFromXp(xp);
    const max = level >= SP.levels.length;
    const floor = passThreshold(level);
    const next = max ? null : SP.levels[level];
    const need = next ? Math.max(1, Number(next.xpRequired) || 1) : 0;
    const current = Math.max(0, xp - floor);
    return {
      xp, level, max, need, current,
      totalNeeded: next ? floor + need : totalPassXp(),
      pct: max ? 100 : Math.max(0, Math.min(100, Math.round(current / need * 100))),
      claimed: pass.claimed || {},
      levels: SP.levels,
    };
  }

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

  function ensure() {
    if (!GAME_STATE.meta || typeof GAME_STATE.meta !== 'object') GAME_STATE.meta = {};
    const g = GAME_STATE.meta;
    g.v = D.VERSION;
    if (!g.mastery || typeof g.mastery !== 'object') g.mastery = {};
    if (!g.pass || typeof g.pass !== 'object') {
      const legacyXp = Math.max(0, Number(g.season?.sp) || 0);
      g.pass = { xp: Math.min(totalPassXp(), legacyXp), claimed: {} };
    }
    g.pass.xp = Math.max(0, Math.min(totalPassXp(), Math.floor(Number(g.pass.xp) || 0)));
    if (!g.pass.claimed || typeof g.pass.claimed !== 'object') g.pass.claimed = {};
    delete g.season;
    delete g.last;
    if (!g.seeded) seedFromLegacy();
    if (!GAME_STATE.ownedIdolFrames || typeof GAME_STATE.ownedIdolFrames !== 'object') GAME_STATE.ownedIdolFrames = {};
    if (!GAME_STATE.equippedIdolFrames || typeof GAME_STATE.equippedIdolFrames !== 'object') GAME_STATE.equippedIdolFrames = {};
    return g;
  }

  function persist() {
    try { savePlayerState(); } catch (e) { console.warn('[Meta] save failed', e); }
  }

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

  function claimPassLevel(index) {
    ensure();
    const info = passInfo();
    const def = SP.levels[index];
    if (!def || index >= info.level || GAME_STATE.meta.pass.claimed[index]) return null;
    const reward = def.reward || {};
    const given = { type: reward.type || 'coins', amount: 0, boxStar: 0 };
    if (reward.type === 'diamonds') {
      const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
      GAME_STATE.diamonds = Math.max(0, Number(GAME_STATE.diamonds) || 0) + amount;
      given.amount = amount;
    } else if (reward.type === 'box') {
      let star = 1;
      const odds = GAME_CONFIG.dailyBox.starUpgradeChance || {};
      for (let attempt = 0; attempt < 4 && star < 5; attempt++) {
        if (Math.random() < (Number(odds[star]) || 0)) star++;
      }
      const amount = Math.max(0, Number(GAME_CONFIG.dailyBox.rewardCoins?.[star]) || 0);
      addCoinsToGame(amount, 'dailybox');
      given.type = 'box'; given.boxStar = star; given.amount = amount;
    } else {
      const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
      addCoinsToGame(amount, 'season');
      given.type = 'coins'; given.amount = amount;
    }
    GAME_STATE.meta.pass.claimed[index] = 1;
    persist();
    return given;
  }

  function claimablePassLevels() {
    const info = passInfo(), out = [];
    for (let i = 0; i < info.level; i++) if (!info.claimed[i]) out.push(i);
    return out;
  }

  function onRunComplete(game, info = {}) {
    ensure();
    const g = state();
    const rewards = SP.xpPerRun?.[game] || {};
    const passXp = Math.max(0, Math.floor(Number(info.passed ? rewards.pass : rewards.fail) || 0));
    const beforeLevel = passLevelFromXp(g.pass.xp);
    g.pass.xp = Math.min(totalPassXp(), g.pass.xp + passXp);
    const afterLevel = passLevelFromXp(g.pass.xp);
    const levelsUnlocked = [];
    for (let level = beforeLevel + 1; level <= afterLevel; level++) levelsUnlocked.push(level);

    const ups = [];
    const lead = leadKey();
    if (lead) ups.push(...addXp(lead, info.passed ? D.XP.leadPass : D.XP.leadFail).map(l => [lead, l]));
    const seen = new Set();
    (info.keys || []).forEach(k => {
      if (seen.has(k)) return;
      seen.add(k);
      ups.push(...addXp(k, info.passed ? D.XP.deckPass : D.XP.deckFail).map(l => [k, l]));
    });
    if (info.targetKey && info.passed) ups.push(...addXp(info.targetKey, D.XP.targetPass).map(l => [info.targetKey, l]));

    const bonus = Math.floor((Number(info.coins) || 0) * coinBonusPct());
    if (bonus > 0) addCoinsToGame(bonus, 'mastery');
    try { if (typeof questsOnRunComplete === 'function') questsOnRunComplete(game, info); } catch (e) { console.warn('[Quests]', e); }
    try { if (Meta.ui) Meta.ui.refresh(); } catch (e) {}
    ups.forEach(([k, lv], i) => setTimeout(() => {
      try { showToast(`${idolName(k)} Mastery Lv.${lv}! +${(lv * D.LEVELUP_COINS_PER_LEVEL).toLocaleString()} coins`, 'success'); } catch (e) {}
    }, 900 * (i + 1)));
    persist();
    return { passXp, passLevel: afterLevel, levelsUnlocked, fandomBonus: bonus };
  }

  function afterRemoteApply() { ensure(); try { Meta.ui && Meta.ui.refresh(); } catch (e) {} }
  function tick() { ensure(); return false; }
  function syncBattles() { ensure(); return 0; }

  return {
    ensure, tick, syncBattles, onRunComplete, afterRemoteApply,
    levelOf, xpOf, progress, fandomPower, coinBonusPct, leadKey, ownedKeys, idolName,
    state, addXp, passInfo, passThreshold, passLevelFromXp, claimPassLevel,
    claimablePassLevels, totalPassXp, ui: null,
  };
})();
