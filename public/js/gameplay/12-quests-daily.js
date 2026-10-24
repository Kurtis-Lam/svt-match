// File: public/js/gameplay/12-quests-daily.js
// ── Quest stats read live from the save (used by the per-game tiered quests) ──
const QUEST_STAT_GETTERS = {
  showtimeLevel: () => GAME_STATE.level || 0,
  spotlightLevel: () => GAME_STATE.spotlightLevel || 0,
  spotlightBestCorrect: () => GAME_STATE.stats?.spotlightBestCorrect || 0,
  snakeLevel: () => GAME_STATE.snakeventeenLevel || 0,
  snakeLongest: () => GAME_STATE.stats?.snakeventeenLongestLength || 0,
  echoLevel: () => GAME_STATE.meta?.echo?.level || 0,
  echoBestRounds: () => GAME_STATE.meta?.echo?.bestRounds || 0,
};
const QUEST_GAME_ICON = { showtime: '🎴', spotlight: '🔦', snakeventeen: '🐍', echo: '🎶', any: '⭐' };
const QUEST_GAME_ORDER = { showtime: 0, spotlight: 1, snakeventeen: 2, echo: 3 };

function questTieredDefs() { return GAME_CONFIG.quests.tiered || []; }
function questTieredDef(id) { return questTieredDefs().find(d => d.id === id) || null; }

function ensureAllQuests() {
  if (!Array.isArray(GAME_STATE.quests)) GAME_STATE.quests = [];
  const haveIdol = (idolKey) => GAME_STATE.quests.some(q => q.type === "match_idol_tier" && q.idolKey === idolKey);
  IDOLS.forEach(idol => {
    if (!haveIdol(idol.key)) GAME_STATE.quests.push(makeIdolQuest(idol.key, QUEST_TIERS[0]));
  });
  const ensureTimed = (type, tiers) => {
    const exists = GAME_STATE.quests.some(q => q.type === type);
    if (!exists) {
      GAME_STATE.quests.push(makeTimedQuest(type, tiers[0]));
    }
  };
  ensureTimed("complete_level_under_30s", QUEST_UNDER_30_TIERS);
  ensureTimed("complete_level_under_20s", QUEST_UNDER_20_TIERS);
  questTieredDefs().forEach(def => {
    if (!GAME_STATE.quests.some(q => q.type === 'stat_tier' && q.defId === def.id)) {
      GAME_STATE.quests.push(makeStatQuest(def, 0));
    }
  });
}

function makeIdolQuest(idolKey, target) {
  const idol = IDOLS.find(i => i.key === idolKey);
  return {
    id: `q_${idolKey}_${target}`,
    type: "match_idol_tier",
    idolKey,
    idolName: idol?.display || idolKey,
    target,
    progress: 0,
    rewardCoins: QUEST_REWARD_COINS[target] ?? 0,
    claimed: false
  };
}

function makeTimedQuest(type, target) {
  const is30 = type === "complete_level_under_30s";
  const reward = is30 ? (TIMED_QUEST_REWARD_COINS.under30[target] ?? 0) : (TIMED_QUEST_REWARD_COINS.under20[target] ?? 0);
  return {
    id: `q_${type}_${target}`,
    type,
    target,
    rewardCoins: reward,
    claimed: false,
    progress: 0
  };
}

function makeStatQuest(def, tierIdx) {
  const target = def.tiers[tierIdx];
  const get = QUEST_STAT_GETTERS[def.stat];
  return {
    id: `q_${def.id}_${target}`,
    type: 'stat_tier',
    defId: def.id,
    game: def.game,
    target,
    progress: Math.min(target, get ? get() : 0),
    rewardCoins: def.rewards[tierIdx] ?? 0,
    claimed: false
  };
}

function hydrateQuestProgressFromStats() {
  for (const q of (GAME_STATE.quests || [])) {
    if (q.type === "match_idol_tier") {
      const total = GAME_STATE.stats.idolMatches[q.idolKey] || 0;
      q.progress = Math.min(q.target, total);
    }
    if (q.type === "complete_level_under_30s") {
      const total = GAME_STATE.stats.levelsUnder30 || 0;
      q.progress = Math.min(q.target, total);
    }
    if (q.type === "complete_level_under_20s") {
      const total = GAME_STATE.stats.levelsUnder20 || 0;
      q.progress = Math.min(q.target, total);
    }
    if (q.type === "stat_tier") {
      const def = questTieredDef(q.defId);
      const get = def && QUEST_STAT_GETTERS[def.stat];
      if (get && !q.claimed) q.progress = Math.min(q.target, get());
    }
  }
  const advanceTimedIfPast = (type, tiers, progress) => {
    let q = GAME_STATE.quests.find(x => x.type === type);
    if (!q) return;
    let idx = tiers.indexOf(q.target);
    if (idx < 0) idx = 0;
    while (idx < tiers.length - 1 && progress >= tiers[idx]) {
      if (q.progress >= q.target && !q.claimed) break;
      const nextTier = tiers[idx + 1];
      if (progress >= nextTier) {
        q.id = `q_${type}_${nextTier}`;
        q.target = nextTier;
        const reward = type === "complete_level_under_30s" ? (TIMED_QUEST_REWARD_COINS.under30[nextTier] ?? 0) : (TIMED_QUEST_REWARD_COINS.under20[nextTier] ?? 0);
        q.rewardCoins = reward;
        q.progress = Math.min(progress, nextTier);
        q.claimed = false;
        idx++;
      } else {
        break;
      }
    }
  };
  advanceTimedIfPast("complete_level_under_30s", QUEST_UNDER_30_TIERS, GAME_STATE.stats.levelsUnder30 || 0);
  advanceTimedIfPast("complete_level_under_20s", QUEST_UNDER_20_TIERS, GAME_STATE.stats.levelsUnder20 || 0);
}

function questIsDone(q) {
  if (!q || q.target == null || q.target <= 0) return false;  // Q-03 FIX: guard undefined/zero target
  return (q.progress || 0) >= q.target;
}

// ── DAILY QUESTS (reset 00:00 UTC+8, stored in GAME_STATE.meta.dq) ───────────
function dailyQuestDefs() { return GAME_CONFIG.quests.daily.list || []; }

function ensureDailyQuests() {
  if (!GAME_STATE.meta || typeof GAME_STATE.meta !== 'object') GAME_STATE.meta = {};
  const today = hkDayKey();
  let dq = GAME_STATE.meta.dq;
  if (!dq || typeof dq !== 'object' || dq.day !== today) dq = GAME_STATE.meta.dq = { day: today, items: {} };
  if (!dq.items || typeof dq.items !== 'object') dq.items = {};
  dailyQuestDefs().forEach(d => {
    const it = dq.items[d.id] || (dq.items[d.id] = { progress: 0, claimed: false });
    it.progress = Math.max(0, Math.min(d.target, Number(it.progress) || 0));
    it.claimed = !!it.claimed;
  });
  return dq;
}

function dailyQuestView() {
  const dq = ensureDailyQuests();
  return dailyQuestDefs().map(d => {
    const it = dq.items[d.id];
    return {
      id: d.id, type: 'daily', game: d.game, title: d.title, target: d.target,
      progress: it.progress, rewardCoins: d.coins, claimed: it.claimed,
    };
  });
}

// Called from Meta.onRunComplete — every finished solo run of every game
function questsOnRunComplete(game, info = {}) {
  const dq = ensureDailyQuests();
  dailyQuestDefs().forEach(d => {
    if (d.game !== 'any' && d.game !== game) return;
    const it = dq.items[d.id];
    if (it.claimed || it.progress >= d.target) return;
    const hit = d.metric === 'passes' ? !!info.passed : d.metric === 'streaks' ? !!(info.passed && info.elite) : true;
    if (hit) it.progress = Math.min(d.target, it.progress + 1);
  });
  hydrateQuestProgressFromStats();
  updateQuestBadges();
}

function msUntilDailyReset(now = Date.now()) {
  const HK = 8 * 3600e3, DAY = 86400e3;
  return (Math.floor((now + HK) / DAY) + 1) * DAY - HK - now;
}

function fmtResetIn(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function getClaimableCount() {
  const regular = (GAME_STATE.quests || []).filter(q => questIsDone(q) && !q.claimed).length;
  const daily = dailyQuestView().filter(q => questIsDone(q) && !q.claimed).length;
  return regular + daily;
}

function updateQuestBadges() {
  const count = getClaimableCount();
  const badge = document.getElementById('questsBadgeNav');
  setBadgeVisibility(badge, count);
}

// collapse state for the two sections (remembered between visits)
const QUEST_UI = (() => {
  let s = { daily: true, quests: true };
  try { s = { ...s, ...JSON.parse(localStorage.getItem('svt:questsUi') || '{}') }; } catch (e) {}
  return s;
})();
let _questClock = null;

function toggleQuestSection(key) {
  QUEST_UI[key] = !QUEST_UI[key];
  try { localStorage.setItem('svt:questsUi', JSON.stringify(QUEST_UI)); } catch (e) {}
  const sec = document.querySelector(`.qsec[data-sec="${key}"]`);
  if (sec) sec.classList.toggle('open', !!QUEST_UI[key]);
}

function openQuests() {
  ensureDailyQuests();
  updateQuestBadges();
  showScreen('questsScreen');
  window.setTimeout(() => {
    const screen = document.getElementById('questsScreen');
    if (screen && !screen.classList.contains('hidden')) {
      renderQuests();
      updateQuestBadges();
    }
  }, 45);
  clearInterval(_questClock);
  _questClock = setInterval(() => {
    const scr = document.getElementById('questsScreen');
    if (!scr || scr.classList.contains('hidden')) { clearInterval(_questClock); return; }
    const dayNow = hkDayKey();
    if (GAME_STATE.meta?.dq?.day !== dayNow) { renderQuests(); updateQuestBadges(); return; }
    const el = document.getElementById('dqReset');
    if (el) el.textContent = `Resets in ${fmtResetIn(msUntilDailyReset())}`;
  }, 30000);
}

function questSortKey(q) {
  if (q.type === "complete_level_under_20s") return [0, 0, "", q.target || 0];
  if (q.type === "complete_level_under_30s") return [0, 1, "", q.target || 0];
  if (q.type === "stat_tier") {
    const defs = questTieredDefs();
    const di = defs.findIndex(d => d.id === q.defId);
    return [1 + (QUEST_GAME_ORDER[q.game] ?? 9), di, "", q.target || 0];
  }
  if (q.type === "match_idol_tier") {
    const rar = IDOL_RARITY[q.idolKey] || "rare";
    const rarIdx = RARITY_ORDER.indexOf(rar);
    const name = (q.idolName || "").toLowerCase();
    return [10 + (rarIdx < 0 ? 99 : rarIdx), 0, name, q.target || 0];
  }
  return [999, 0, "", 0];
}

function questPercent(q) {
  const p = (q.progress || 0);
  const t = (q.target || 1);
  return Math.max(0, Math.min(100, Math.round((p / t) * 100)));
}

function questTitle(q) {
  if (q.type === "daily") return q.title;
  if (q.type === "match_idol_tier") return `Get ${q.idolName} ${q.target} times`;
  if (q.type === "complete_level_under_30s") return `Complete a level within ${GAME_CONFIG.quests.timed.fastSeconds}s (${q.target}x)`;
  if (q.type === "complete_level_under_20s") return `Complete a level within ${GAME_CONFIG.quests.timed.blitzSeconds}s (${q.target}x)`;
  if (q.type === "stat_tier") {
    const def = questTieredDef(q.defId);
    return def ? def.title.replace('{t}', q.target) : 'Quest';
  }
  return "Quest";
}

function questProgressText(q) {
  return `${q.progress || 0}/${q.target || 0}`;
}

function questBarColor(q) {
  if (q.type === "daily") return "#f59e0b";
  if (q.type === "stat_tier") return "#6366f1";
  if (q.type === "complete_level_under_20s" || q.type === "complete_level_under_30s") return "#0f172a";
  if (q.type === "match_idol_tier") {
    const rar = IDOL_RARITY[q.idolKey] || "rare";
    const colorByRarity = {
      legendary: "#facc15",
      mythic: "#ef4444",
      epic: "#a855f7",
      superrare: "#3b82f6",
      rare: "#22c55e"
    };
    return colorByRarity[rar] || "#94a3b8";
  }
  return "#ec4899";
}

function rewardHtml(coins) {
  return `
    <span class="qcard-coins">+${Number(coins).toLocaleString()}<img src="/coin.png" alt=""></span>
  `;
}

function questIconHtml(q) {
  if (q.type === "match_idol_tier") return `<img src="/imgs/${escapeHtml(q.idolKey)}/1.jpg" alt="" loading="lazy" decoding="async">`;
  if (q.type === "complete_level_under_20s" || q.type === "complete_level_under_30s") return '<span>⏱️</span>';
  return `<span>${QUEST_GAME_ICON[q.game] || '⭐'}</span>`;
}

function buildQuestCard(q, onClaim) {
  const pct = questPercent(q);
  const done = questIsDone(q);
  const claimable = done && !q.claimed;
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `qcard ${claimable ? 'claimable' : ''} ${q.claimed ? 'claimed' : ''}`;
  card.onclick = () => { if (claimable) onClaim(card); };
  card.innerHTML = `
    <div class="qcard-ico">${questIconHtml(q)}</div>
    <div class="qcard-main">
      <p class="qcard-title">${escapeHtml(questTitle(q))}</p>
      <div class="qcard-barrow">
        <div class="qcard-bar"><i style="width:${pct}%; background:${done ? '#22c55e' : questBarColor(q)}"></i></div>
        <span class="qcard-count">${questProgressText(q)}</span>
      </div>
    </div>
    <div class="qcard-side">
      ${q.claimed ? '<span class="qcard-done"><i class="fas fa-check"></i></span>' : claimable ? '<span class="qcard-claim">Claim</span>' : ''}
      ${rewardHtml(q.rewardCoins)}
    </div>`;
  return card;
}

function buildQuestSection(key, title, icon, metaHtml, cards, claimableN) {
  const sec = document.createElement('section');
  sec.className = `qsec ${QUEST_UI[key] ? 'open' : ''}`;
  sec.dataset.sec = key;
  sec.innerHTML = `
    <button type="button" class="qsec-head" onclick="toggleQuestSection('${key}')" aria-expanded="${!!QUEST_UI[key]}">
      <span class="qsec-ico"><i class="fas ${icon}"></i></span>
      <span class="qsec-txt"><b>${title}</b><small>${metaHtml}</small></span>
      ${claimableN ? `<span class="qsec-badge">${claimableN}</span>` : ''}
      <i class="fas fa-chevron-down qsec-chev"></i>
    </button>
    ${claimableN > 1 ? `<button type="button" class="btn-theme black-text" style="margin:6px 12px 0;padding:8px 14px;font-size:13px;width:calc(100% - 24px)" onclick="claimAllQuests('${key === 'daily' ? 'daily' : 'quests'}')">Claim all (${claimableN})</button>` : ''}
    <div class="qsec-collapse"><div class="qsec-inner"><div class="qsec-list"></div></div></div>`;
  const list = sec.querySelector('.qsec-list');
  cards.forEach(c => list.appendChild(c));
  return sec;
}

function renderQuests() {
  const list = document.getElementById('questsList');
  if (!list) return;
  list.innerHTML = "";

  // 1) Daily quests first
  const daily = dailyQuestView();
  const dClaimable = daily.filter(q => questIsDone(q) && !q.claimed).length;
  const dDone = daily.filter(q => q.claimed || questIsDone(q)).length;
  const dCards = daily.map(q => buildQuestCard(q, el => claimDailyQuest(q.id, el)));
  list.appendChild(buildQuestSection('daily', 'Daily Quests', 'fa-sun',
    `${dDone}/${daily.length} done · <span id="dqReset">Resets in ${fmtResetIn(msUntilDailyReset())}</span>`, dCards, dClaimable));

  // 2) Long-term quests
  const quests = [...(GAME_STATE.quests || [])].sort((a, b) => {
    const aClaimable = questIsDone(a) && !a.claimed;
    const bClaimable = questIsDone(b) && !b.claimed;
    if (aClaimable !== bClaimable) return aClaimable ? -1 : 1;
    const ak = questSortKey(a);
    const bk = questSortKey(b);
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] < bk[i]) return -1;
      if (ak[i] > bk[i]) return 1;
    }
    return 0;
  });
  const qClaimable = quests.filter(q => questIsDone(q) && !q.claimed).length;
  const qCards = quests.map(q => buildQuestCard(q, el => claimQuest(q.id, el)));
  list.appendChild(buildQuestSection('quests', 'Quests', 'fa-scroll',
    `${quests.length} quests · rewards are bigger`, qCards, qClaimable));
}

async function _finishQuestClaim(added, el) {
  const startCoins = GAME_STATE.coins - added;
  renderHub();
  renderQuests();
  updateQuestBadges();
  const saving = savePlayerState();
  animateCoinsToBar(el || document.getElementById('questsList'), added).catch(() => {});
  animateNumber(document.getElementById('hubCoins'), startCoins, GAME_STATE.coins);
  animateNumber(document.getElementById('gameCoins'), startCoins, GAME_STATE.coins);
  animateNumber(document.getElementById('questsCoins'), startCoins, GAME_STATE.coins);
  animateNumber(document.getElementById('idolsCoins'), startCoins, GAME_STATE.coins);
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) animateNumber(shopCoins, startCoins, GAME_STATE.coins);
  await saving;
}

async function claimAllQuests(kind) {
  const jobs = [];
  if (kind === 'daily') {
    dailyQuestView().filter(q => questIsDone(q) && !q.claimed).forEach(q => jobs.push(claimDailyQuest(q.id, null)));
  } else {
    (GAME_STATE.quests || []).filter(q => questIsDone(q) && !q.claimed).map(q => q.id).forEach(id => jobs.push(claimQuest(id, null)));
  }
  await Promise.all(jobs);
}

const _claimingIds = new Set();
async function claimDailyQuest(id, el) {
  const key = 'd:' + id;
  if (_claimingIds.has(key)) return;
  const def = dailyQuestDefs().find(d => d.id === id);
  const it = ensureDailyQuests().items[id];
  if (!def || !it || it.claimed || it.progress < def.target) return;
  _claimingIds.add(key);
  const res = await claimAwardSafe('quest', { kind: 'daily', id });
  if (!res) { _claimingIds.delete(key); return; }
  it.claimed = true;
  try {
    const added = Number(res.added) || 0;
    await _finishQuestClaim(added, el);
    if (el && window.RewardPopups) {
      RewardPopups.show({
        type: 'quest',
        title: def.title,
        description: 'Daily quest completed. Your coins have been added.',
        icon: '🪙',
        amount: added,
        rewardLabel: 'coins',
        onAction: () => {}
      });
    }
  } catch (err) {
    it.claimed = false;
    console.error('[claimDailyQuest] failed, reverted:', err);
    showToast('Claim failed – please try again', 'error');
    try { renderQuests(); renderHub(); } catch (e) {}
  } finally {
    _claimingIds.delete(key);
  }
}

async function claimQuest(questId, questElForAnim) {
  const idx = (GAME_STATE.quests || []).findIndex(x => x.id === questId);
  if (idx < 0) return;
  const q = GAME_STATE.quests[idx];
  if (q.claimed || _claimingIds.has('q:' + questId)) return;
  if (!questIsDone(q)) return;
  const claimedQuestTitle = questTitle(q);
  _claimingIds.add('q:' + questId);
  let ctx = null;
  if (q.type === "match_idol_tier") ctx = { kind: 'idol', idolKey: q.idolKey, tier: q.target };
  else if (q.type === "complete_level_under_30s") ctx = { kind: 'fast', tier: q.target };
  else if (q.type === "complete_level_under_20s") ctx = { kind: 'blitz', tier: q.target };
  else if (q.type === "stat_tier") ctx = { kind: 'tiered', id: q.defId, tier: q.target };
  const res = ctx ? await claimAwardSafe('quest', ctx) : null;
  if (!res) { _claimingIds.delete('q:' + questId); return; }
  const added = Number(res.added) || 0;
  try {
    q.claimed = true;
    if (q.type === "match_idol_tier") {
      const nextTier = QUEST_TIERS[QUEST_TIERS.indexOf(q.target) + 1];
      if (nextTier) {
        const total = GAME_STATE.stats.idolMatches[q.idolKey] || 0;
        const nextQ = makeIdolQuest(q.idolKey, nextTier);
        nextQ.progress = Math.min(nextQ.target, total);
        GAME_STATE.quests[idx] = nextQ;
      }
    }
    if (q.type === "complete_level_under_30s") {
      const nextTier = QUEST_UNDER_30_TIERS[QUEST_UNDER_30_TIERS.indexOf(q.target) + 1];
      if (nextTier) {
        const nextQ = makeTimedQuest("complete_level_under_30s", nextTier);
        nextQ.progress = Math.min(nextQ.target, GAME_STATE.stats.levelsUnder30 || 0);
        GAME_STATE.quests[idx] = nextQ;
      }
    }
    if (q.type === "complete_level_under_20s") {
      const nextTier = QUEST_UNDER_20_TIERS[QUEST_UNDER_20_TIERS.indexOf(q.target) + 1];
      if (nextTier) {
        const nextQ = makeTimedQuest("complete_level_under_20s", nextTier);
        nextQ.progress = Math.min(nextQ.target, GAME_STATE.stats.levelsUnder20 || 0);
        GAME_STATE.quests[idx] = nextQ;
      }
    }
    if (q.type === "stat_tier") {
      const def = questTieredDef(q.defId);
      const ti = def ? def.tiers.indexOf(q.target) : -1;
      if (def && ti >= 0 && ti + 1 < def.tiers.length) GAME_STATE.quests[idx] = makeStatQuest(def, ti + 1);
    }
    await _finishQuestClaim(added, questElForAnim);
    if (questElForAnim && window.RewardPopups) {
      RewardPopups.show({
        type: 'quest',
        title: claimedQuestTitle,
        description: 'Quest completed. Your coins have been added.',
        icon: '🪙',
        amount: added,
        rewardLabel: 'coins',
        onAction: () => {}
      });
    }
  } catch (_claimErr) {
    // Q-05 FIX: revert on failure
    q.claimed = false;
    console.error('[claimQuest] failed, reverted:', _claimErr);
    showToast('Claim failed – please try again', 'error');
    try { renderQuests(); renderHub(); } catch (e) {}
  } finally {
    _claimingIds.delete('q:' + questId);
  }
}

async function updateTieredQuestsAfterMatch(idolKey) {
  if (isBattleRunActive()) return;  // Q-04: already guarded — save also skipped below
  const total = GAME_STATE.stats.idolMatches[idolKey] || 0;
  const q = (GAME_STATE.quests || []).find(x => x.type === "match_idol_tier" && x.idolKey === idolKey);
  if (q && !q.claimed) q.progress = Math.min(q.target, total);
  if (!document.getElementById('idolsScreen').classList.contains('hidden')) renderIdols();
  updateQuestBadges();
  if (!isBattleRunActive()) await savePlayerState();  // Q-04 FIX: skip save during battles
}

async function updateTimedQuestsAfterLevel(timeSec) {
  const q30 = (GAME_STATE.quests || []).find(x => x.type === "complete_level_under_30s");
  const q20 = (GAME_STATE.quests || []).find(x => x.type === "complete_level_under_20s");
  if (q30 && !q30.claimed) {
    const total = GAME_STATE.stats.levelsUnder30 || 0;
    q30.progress = Math.min(q30.target, total);
  }
  if (q20 && !q20.claimed) {
    const total = GAME_STATE.stats.levelsUnder20 || 0;
    q20.progress = Math.min(q20.target, total);
  }
  updateQuestBadges();
  await savePlayerState();
}
let WHEEL_SPINNING = false;
let WHEEL_RESULT = null;
const WHEEL_SEG_COUNT = 8;
const WHEEL_SEG_DEG = 360 / WHEEL_SEG_COUNT;

// ── Wheel colours ─────────────────────────────────────────────────
// Each section gets a solid colour sampled at a random point along one
// idol's theme gradient (IDOL_THEME). 8 different idols are used, then
// arranged so neighbours (including last→first) are as far apart as possible.
function _hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function _rgbToHex(c) { return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function _rgbToLab(c) {
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const r = f(c[0]), g = f(c[1]), b = f(c[2]);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const h = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  return [116 * h(y) - 16, 500 * (h(x) - h(y)), 200 * (h(y) - h(z))];
}
function _labDist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function pickWheelColors(count) {
  const idols = Object.keys(IDOL_THEME);
  let best = null, bestScore = -1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const picks = shuffled(idols).slice(0, count).map(k => {
      const [a, b] = IDOL_THEME[k].map(_hexToRgb);
      const t = Math.random();
      const rgb = a.map((v, i) => v + (b[i] - v) * t);
      return { hex: _rgbToHex(rgb), lab: _rgbToLab(rgb) };
    });
    // random-restart arrangement, keep the ring with the best weakest neighbour gap
    for (let s = 0; s < 40; s++) {
      const ring = shuffled(picks);
      let min = Infinity;
      for (let i = 0; i < count; i++) min = Math.min(min, _labDist(ring[i].lab, ring[(i + 1) % count].lab));
      if (min > bestScore) { bestScore = min; best = ring; }
    }
    if (bestScore >= 16) break; // clearly distinguishable pastels – good enough
  }
  return best.map(p => p.hex);
}

function renderWheelLabels() {
  DAILY_PRIZES = shuffled(BASE_DAILY_PRIZES);
  _frozenDailyPrizes = DAILY_PRIZES.slice();  // G-09 FIX: snapshot
  const host = document.getElementById('wheelLabels');
  const wheel = document.getElementById('dailyWheel');
  if (!host || !wheel) return;
  host.innerHTML = "";
  const radius = 105;
  const segmentDeg = 360 / DAILY_PRIZES.length;
  // Build gradient wheel background from idol theme colors
  // G-02 FIX: removed dead 'wheelStops' variable (was built from empty template literals)
  // Use a layered conic gradient
  const wheelColors = pickWheelColors(DAILY_PRIZES.length);
  wheel.style.background = `
    conic-gradient(
      ${wheelColors.map((color, idx) => `${color} ${idx * segmentDeg}deg ${(idx + 1) * segmentDeg}deg`).join(', ')}
    )
  `;
  DAILY_PRIZES.forEach((prize, idx) => {
    const centerDeg = (idx * segmentDeg) + (segmentDeg / 2);
    const el = document.createElement('div');
    el.className = 'wheel-label';
    el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:2px;line-height:1;">${prize}<img src="/coin.png" style="width:0.82em;height:0.82em;margin-left:2px;"></span>`;
    const tangentDeg = centerDeg + 90;
    el.style.transform = `rotate(${centerDeg}deg) translate(${radius}px) rotate(${tangentDeg - centerDeg}deg) translate(-50%, -50%)`;
    host.appendChild(el);
  });
  host.style.transition = 'none';
  host.style.transform = 'rotate(0deg)';
}

let _frozenDailyPrizes = null;  // G-09 FIX: freeze prizes after first render
function openDailyWheelOverlay() {
  if (!currentUser) return;
  ensureDailyResetIfNeeded();
  if (GAME_STATE.daily.hasDrawn) return;
  renderWheelLabels();
  WHEEL_SPINNING = false;
  WHEEL_RESULT = null;
  const wheel = document.getElementById('dailyWheel');
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  const labels = document.getElementById('wheelLabels');
  if (labels) {
    labels.style.transition = 'none';
    labels.style.transform = 'rotate(0deg)';
  }
  const btn = document.getElementById('wheelSpinBtn');
  btn.disabled = false;
  btn.innerHTML = 'TAP<br/>SPIN';
  const overlay = document.getElementById('wheelOverlay');
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeWheelOverlay() {
  document.getElementById('wheelOverlay').classList.remove('show');
  document.getElementById('wheelOverlay').setAttribute('aria-hidden', 'true');
}

function openDailyPrizeOverlay(prize) {
  if (window.RewardPopups) {
    RewardPopups.show({
      type: 'dailyWheel',
      title: 'Daily Draw Reward',
      description: 'Your Daily Draw coins are ready to collect.',
      icon: '🪙',
      amount: Number(prize) || 0,
      rewardLabel: 'coins',
      actionLabel: 'Claim',
      onAction: claimDailyPrize
    });
    return;
  }
  const el = document.getElementById('dailyPrizeCoins');
  if (el) el.textContent = String(prize);
  const overlay = document.getElementById('dailyPrizeOverlay');
  if (overlay) {
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

function closeDailyPrizeOverlay() {
  if (window.RewardPopups) RewardPopups.close();
  const overlay = document.getElementById('dailyPrizeOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

async function spinDailyWheelFromOverlay() {
  if (!currentUser) return;
  ensureDailyResetIfNeeded();
  if (GAME_STATE.daily.hasDrawn) return;
  if (WHEEL_SPINNING) return;
  // PATCH S-04/G-06: lock out a second spin immediately so rapid taps
  // or closing-and-reopening the overlay cannot spin again.
  WHEEL_SPINNING = true;
  const btn = document.getElementById('wheelSpinBtn');
  btn.disabled = true;
  btn.textContent = '...';
  const wheelBefore = GAME_STATE.coins;
  // The server picks the prize and pays it; the wheel only animates the result.
  const wheelRes = await claimAwardSafe('dailywheel', {});
  if (!wheelRes) {
    WHEEL_SPINNING = false;
    btn.disabled = false;
    btn.innerHTML = 'TAP<br/>SPIN';
    return;
  }
  GAME_STATE.daily.hasDrawn = true;
  savePlayerState();
  const prize = Number(wheelRes.extra && wheelRes.extra.prize) || 0;
  const idx = DAILY_PRIZES.indexOf(prize);
  const segmentCenterDeg = (idx * WHEEL_SEG_DEG) + (WHEEL_SEG_DEG / 2);
  const TOP_DEG = 270;
  const targetDegWithinTurn = TOP_DEG - segmentCenterDeg;
  const spins = 6 + Math.floor(Math.random() * 3);
  const finalDeg = (spins * 360) + targetDegWithinTurn;
  const wheel = document.getElementById('dailyWheel');
  wheel.style.transition = 'transform 3.6s cubic-bezier(0.12, 0.8, 0.12, 1)';
  wheel.style.transform = `rotate(${finalDeg}deg)`;
  const labels = document.getElementById('wheelLabels');
  if (labels) {
    labels.style.transition = 'transform 3.6s cubic-bezier(0.12, 0.8, 0.12, 1)';
    labels.style.transform = `rotate(${finalDeg}deg)`;
  }
  WHEEL_RESULT = {
    prize,
    beforeCoins: wheelBefore
  };
  setTimeout(() => {
    WHEEL_SPINNING = false;
    openDailyPrizeOverlay(prize);
  }, 3700);
}

async function claimDailyPrize() {
  if (!currentUser) return;
  ensureDailyResetIfNeeded();
  // hasDrawn is set provisionally when the wheel spins, so the pending
  // WHEEL_RESULT (not hasDrawn) decides whether a prize is still owed.
  if (!WHEEL_RESULT) {
    closeDailyPrizeOverlay();
    closeWheelOverlay();
    updateDailyDrawUI();
    return;
  }
  const {
    prize,
    beforeCoins
  } = WHEEL_RESULT;
  WHEEL_RESULT = null; // consume immediately: double-tap can't pay twice
  GAME_STATE.daily.hasDrawn = true;
  // coins were already paid by the server when the wheel was spun
  renderHub();
  updateDailyDrawUI();
  closeDailyPrizeOverlay();
  closeWheelOverlay();
  animateNumber(document.getElementById('hubCoins'), beforeCoins, GAME_STATE.coins);
  animateNumber(document.getElementById('gameCoins'), beforeCoins, GAME_STATE.coins);
  animateNumber(document.getElementById('questsCoins'), beforeCoins, GAME_STATE.coins);
  animateNumber(document.getElementById('idolsCoins'), beforeCoins, GAME_STATE.coins);
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) animateNumber(shopCoins, beforeCoins, GAME_STATE.coins);
  await savePlayerState();
  showToast(`Daily Draw: +${prize} coins`, 'success');
}
// Daily Box Logic
const STAR_UPGRADE_PROB = GAME_CONFIG.dailyBox.starUpgradeChance;
const DAILY_BOX_REWARDS = Object.fromEntries(Object.entries(GAME_CONFIG.dailyBox.rewardCoins).map(([k, v]) => [k, { coins: v }]));

function openDailyBoxOverlay() {
  ensureDailyResetIfNeeded();
  // PATCH S-03/G-05: only reset box state when it has NOT been opened yet.
  // Resetting unconditionally let players re-claim by re-opening the overlay.
  if (!GAME_STATE.daily.box || !GAME_STATE.daily.box.opened) {
    GAME_STATE.daily.box = {
      claimed: false,
      opened: false,
      star: 1
    };
    __dailyBoxAttempts = 4;
    __dailyBoxPhase = "upgrade";
  } else {
    // Already opened – nothing to do, close immediately
    showToast('Daily box already claimed today', 'info');
    return;
  }
  renderDailyBoxStars();
  renderDailyBoxCenterImage();
  renderDailyBoxPhaseLabel();
  const overlay = document.getElementById('dailyBoxOverlay');
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  showDailyBackdrop();
  attachDailyBoxTapHandler();
}

function closeDailyBoxOverlay(dismissedAfterReward = false) {
  const overlay = document.getElementById('dailyBoxOverlay');
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  hideDailyBackdrop();
  if (dismissedAfterReward) {
    const nextBtn = document.getElementById('lcNextBtn');
    const backBtn = document.getElementById('lcBackBtn');
    nextBtn.onclick = () => nextLevelFromPopup();
    backBtn.onclick = () => advanceLevelAndGoHubFromPopup();
    showScreen('hubScreen');
  }
}

function renderDailyBoxStars() {
  const host = document.getElementById('dailyBoxStars');
  if (!host) return;
  host.innerHTML = "";
  const star = (GAME_STATE.daily?.box?.star || 1);
  for (let i = 1; i <= 5; i++) {
    const ic = document.createElement('i');
    ic.className = `fas fa-star star-icon ${i <= star ? 'text-yellow-400' : 'text-gray-300'}`;
    host.appendChild(ic);
  }
  const attemptsEl = document.getElementById('dailyBoxAttempts');
  if (attemptsEl) attemptsEl.textContent = String(__dailyBoxAttempts);
}

function renderDailyBoxCenterImage() {
  const star = (GAME_STATE.daily?.box?.star || 1);
  const img = document.getElementById('dailyBoxCenterImg');
  if (!img) return;
  img.src = boxImageForStar(star);
}

function renderDailyBoxPhaseLabel() {
  const el = document.getElementById('dailyBoxPhaseLabel');
  if (!el) return;
  if (__dailyBoxPhase === "upgrade") {
    el.textContent = `Tap screen to upgrade (${__dailyBoxAttempts} attempts)`;
  } else if (__dailyBoxPhase === "open") {
    el.textContent = `Tap screen to open`;
  } else {
    el.textContent = `Tap to dismiss`;
  }
}

function attachDailyBoxTapHandler() {
  const ov = document.getElementById('dailyBoxOverlay');
  const img = document.getElementById('dailyBoxCenterImg');
  let canTap = false;
  setTimeout(() => {
    canTap = true;
  }, 400);
  const handler = async (e) => {
    if (!canTap) return;
    const path = e.composedPath?.() || [];
    if (path.some(n => n && n.id === 'dailyBoxOverlayCloseBtn')) return;
    if (__dailyBoxPhase === "upgrade") {
      if (__dailyBoxAttempts <= 0) {
        __dailyBoxPhase = "open";
        renderDailyBoxPhaseLabel();
        return;
      }
      const prev = GAME_STATE.daily.box.star;
      if (prev < 5) {
        const p = STAR_UPGRADE_PROB[prev] || 0;
        if (Math.random() < p) {
          GAME_STATE.daily.box.star = Math.min(5, prev + 1);
          renderDailyBoxStars();
          flipImageOnceAndUpdate(img, boxImageForStar(GAME_STATE.daily.box.star), 350);
          showToast(`Upgraded to ${GAME_STATE.daily.box.star}⭐`, 'success');
        } else {
          showToast('No upgrade', 'info');
        }
      } else {
        showToast('Max rarity reached!', 'success');
      }
      __dailyBoxAttempts -= 1;
      renderDailyBoxStars();
      if (__dailyBoxAttempts <= 0) {
        __dailyBoxPhase = "open";
        renderDailyBoxPhaseLabel();
      }
    } else if (__dailyBoxPhase === "open") {
      const reward = resolveDailyBoxReward(GAME_STATE.daily.box.star);
      await applyDailyBoxReward(reward);
      markNextUnclaimedDailyWinCellClaimed();
      resetDailyBoxStarForNextClaim();
      openRewardExperience(reward);
      ov.removeEventListener('click', handler, true);
      closeDailyBoxOverlay(true);
    } else {
      ov.removeEventListener('click', handler, true);
      closeDailyBoxOverlay(true);
    }
  };
  ov.onclick = null;
  ov.addEventListener('click', handler, true);
}

function renderDailyBoxRewardLine(reward) {
  return `+${reward.coins} <img src="/coin.png" style="width:1em;height:1em;vertical-align:middle;">`;
}

// The server rolls the star upgrades and pays the coins; the client only animates the result.
async function svtOpenDailyBoxServer(via) {
  const beforeCoins = GAME_STATE.coins;
  const box = await svtResolveDailyBox(via);
  if (!box) return null;
  return {
    star: box.star,
    reward: { coins: box.coins, idol: null, idolRarity: null },
    beforeCoins
  };
}

function resolveDailyBoxReward(star) {
  const cfg = DAILY_BOX_REWARDS[star] || DAILY_BOX_REWARDS[1];
  return {
    coins: cfg.coins,
    idol: null,
    idolRarity: null
  };
}

async function applyDailyBoxReward(reward) {
  const before = GAME_STATE.coins;
  const box = await svtResolveDailyBox('daily');
  if (box) {
    reward.coins = box.coins;
    GAME_STATE.daily.box.star = box.star;
  } else {
    reward.coins = 0;
    showToast('No daily box is ready right now', 'info');
  }
  renderHub();
  renderIdols();
  animateNumber(document.getElementById('hubCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('gameCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('questsCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('idolsCoins'), before, GAME_STATE.coins);
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) animateNumber(shopCoins, before, GAME_STATE.coins);
  ensureDailyResetIfNeeded();
  await savePlayerState();
}
let __rewardOverlayArmedClose = false;
let __idolAnimationInProgress = false;

function openRewardExperience(reward) {
  const overlay = document.getElementById('rewardOverlay');
  const coinContent = document.getElementById('rewardCoinContent');
  const idolContent = document.getElementById('rewardIdolContent');
  const idolThumb = document.getElementById('idolRevealThumb');
  const idolNameEl = document.getElementById('idolRevealName');
  const idolAbilityEl = document.getElementById('idolRevealAbility');
  const idolRarityDot = document.getElementById('idolRevealRarityDot');
  const idolRarityText = document.getElementById('idolRevealRarityText');
  const idolCard = document.getElementById('idolRevealCard');
  __rewardOverlayArmedClose = false;
  __idolAnimationInProgress = false;
  coinContent.classList.add('hidden');
  idolContent.classList.add('hidden');
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  if (reward.coins && !reward.idol) {
    document.getElementById('rewardCoinText').textContent = `+${reward.coins}`;
    coinContent.classList.remove('hidden');
    const onClickCoins = (e) => {
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.removeEventListener('click', onClickCoins, true);
      showScreen('hubScreen');
    };
    overlay.onclick = null;
    overlay.addEventListener('click', onClickCoins, {
      capture: true
    });
    return;
  }
  if (reward.idol && reward.idolRarity) {
    idolContent.classList.remove('hidden');
    const idol = reward.idol;
    const rarity = reward.idolRarity;
    const pair = IDOL_THEME[idol.key] || ["#f5c6d0", "#9ec5d9"];
    idolCard.style.setProperty('--idolTheme1', pair[0]);
    idolCard.style.setProperty('--idolTheme2', pair[1]);
    const img = `/imgs/${idol.key}/1.jpg`;
    idolThumb.src = img;
    idolThumb.style.filter = 'blur(10px)';
    idolNameEl.textContent = idol.display;
    idolRarityDot.style.background = rarityDotColor(rarity);
    idolRarityText.textContent = rarity === 'superrare' ? 'super rare' : rarity;
    const ability = getAbilityForIdol(idol.key);
    idolAbilityEl.textContent = `Ability: ${ability?.label || '—'}`;
    __idolAnimationInProgress = true;
    idolCard.classList.remove('idol-anim-end');
    idolCard.classList.add('idol-anim-start');
    void idolCard.offsetWidth;
    requestAnimationFrame(() => {
      idolCard.classList.remove('idol-anim-start');
      idolCard.classList.add('idol-anim-end');
      setTimeout(() => {
        idolThumb.style.filter = 'blur(0px)';
        __idolAnimationInProgress = false;
      }, 920);
    });
    const onClickIdol = (e) => {
      if (__idolAnimationInProgress) return;
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.removeEventListener('click', onClickIdol, true);
      showScreen('hubScreen');
    };
    overlay.onclick = null;
    overlay.addEventListener('click', onClickIdol, {
      capture: true
    });
    return;
  }
  const onClickFallback = () => {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.removeEventListener('click', onClickFallback, true);
    showScreen('hubScreen');
  };
  overlay.onclick = null;
  overlay.addEventListener('click', onClickFallback, {
    once: true,
    capture: true
  });
}

function openDailyBoxRewardTapToDismiss(reward) {
  openRewardExperience(reward);
}

function resetDailyBoxFullscreenContent() {
  const content = document.querySelector('#dailyBoxFullscreen .daily-box-fs-content');
  content.innerHTML = `
    <div id="dailyBoxFsStars" class="daily-box-fs-stars"></div>
    <div class="daily-box-fs-box">
      <img id="dailyBoxFsImg" src="/imgs/boxes/1.jpg" alt="Daily Box" />
    </div>
    <div class="daily-box-fs-attempts">
      <div id="dailyBoxFsAttemptsLabel" class="label"></div>
      <div id="dailyBoxFsProgress" class="daily-box-fs-progress">
        <div class="cell" data-cell="1"></div>
        <div class="cell" data-cell="2"></div>
        <div class="cell" data-cell="3"></div>
        <div class="cell" data-cell="4"></div>
      </div>
      <div class="tap-hint mt-2 text-white" id="dailyBoxFsTapHint">Tap! Tap!</div>
    </div>
  `;
  const resultCenter = document.getElementById('dailyResultCenter');
  if (resultCenter) resultCenter.classList.remove('show');
}