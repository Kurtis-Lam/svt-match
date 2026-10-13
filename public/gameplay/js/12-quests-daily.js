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

function getClaimableCount() {
  return (GAME_STATE.quests || []).filter(q => questIsDone(q) && !q.claimed).length;
}

function updateQuestBadges() {
  const count = getClaimableCount();
  const badge = document.getElementById('questsBadgeNav');
  setBadgeVisibility(badge, count);
}

function openQuests() {
  renderHub();
  renderQuests();
  updateQuestBadges();
  showScreen('questsScreen');
}

function questSortKey(q) {
  if (q.type === "complete_level_under_20s") return [0, q.target || 0, "", 0];
  if (q.type === "complete_level_under_30s") return [1, q.target || 0, "", 0];
  if (q.type === "match_idol_tier") {
    const rar = IDOL_RARITY[q.idolKey] || "rare";
    const rarIdx = RARITY_ORDER.indexOf(rar);
    const name = (q.idolName || "").toLowerCase();
    return [2 + (rarIdx < 0 ? 99 : rarIdx), 0, name, q.target || 0];
  }
  return [999, 0, "", 0];
}

function questPercent(q) {
  const p = (q.progress || 0);
  const t = (q.target || 1);
  return Math.max(0, Math.min(100, Math.round((p / t) * 100)));
}

function questTitle(q) {
  if (q.type === "match_idol_tier") return `Get ${q.idolName} ${q.target} times`;
  if (q.type === "complete_level_under_30s") return `Complete a level within 30s (${q.target}x)`;
  if (q.type === "complete_level_under_20s") return `Complete a level within 20s (${q.target}x)`;
  return "Quest";
}

function questProgressText(q) {
  return `${q.progress || 0}/${q.target || 0}`;
}

function questBarColor(q) {
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
    <span class="font-bold text-yellow-600 flex items-center justify-end gap-1">
      +${coins}
      <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">
    </span>
  `;
}

function renderQuests() {
  const list = document.getElementById('questsList');
  if (!list) return;
  list.innerHTML = "";
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
  quests.forEach(q => {
    const pct = questPercent(q);
    const done = questIsDone(q);
    const claimable = done && !q.claimed;
    const color = questBarColor(q);
    const outer = document.createElement('button');
    outer.className = `quest-box w-full text-left ${claimable ? 'claimable' : ''}`;
    outer.onclick = () => {
      if (claimable) claimQuest(q.id, outer);
    };
    outer.innerHTML = `
      <div class="quest-inner">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2">
            <p class="font-bold text-gray-800">${questTitle(q)}</p>
          </div>
          <div class="text-right">
            ${rewardHtml(q.rewardCoins)}
          </div>
        </div>

        <div class="mt-3">
          <div class="flex items-center gap-3">
            <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-2" style="width:${pct}%; background:${done ? '#22c55e' : color}"></div>
            </div>
            <div class="w-14 text-right text-xs font-semibold text-gray-600">${questProgressText(q)}</div>
          </div>

          ${claimable ? `` : ''}
        </div>
      </div>
    `;
    list.appendChild(outer);
  });
}

async function claimQuest(questId, questElForAnim) {
  const idx = (GAME_STATE.quests || []).findIndex(x => x.id === questId);
  if (idx < 0) return;
  const q = GAME_STATE.quests[idx];
  if (q.claimed || q._claiming) return;  // G-11 FIX: optimistic lock
  if (!questIsDone(q)) return;
  q._claiming = true;  // set before any await
  const before = GAME_STATE.coins;
  const added = q.rewardCoins;
  try {
  q.claimed = true;
  addCoinsToGame(added, 'quest');
  if (q.type === "match_idol_tier") {
    const currentTierIdx = QUEST_TIERS.indexOf(q.target);
    const nextTier = QUEST_TIERS[currentTierIdx + 1];
    if (nextTier) {
      const total = GAME_STATE.stats.idolMatches[q.idolKey] || 0;
      const nextQ = makeIdolQuest(q.idolKey, nextTier);
      nextQ.progress = Math.min(nextQ.target, total);
      GAME_STATE.quests[idx] = nextQ;
    }
  }
  if (q.type === "complete_level_under_30s") {
    const currentTierIdx = QUEST_UNDER_30_TIERS.indexOf(q.target);
    const nextTier = QUEST_UNDER_30_TIERS[currentTierIdx + 1];
    if (nextTier) {
      const total = GAME_STATE.stats.levelsUnder30 || 0;
      const nextQ = makeTimedQuest("complete_level_under_30s", nextTier);
      nextQ.progress = Math.min(nextQ.target, total);
      GAME_STATE.quests[idx] = nextQ;
    }
  }
  if (q.type === "complete_level_under_20s") {
    const currentTierIdx = QUEST_UNDER_20_TIERS.indexOf(q.target);
    const nextTier = QUEST_UNDER_20_TIERS[currentTierIdx + 1];
    if (nextTier) {
      const total = GAME_STATE.stats.levelsUnder20 || 0;
      const nextQ = makeTimedQuest("complete_level_under_20s", nextTier);
      nextQ.progress = Math.min(nextQ.target, total);
      GAME_STATE.quests[idx] = nextQ;
    }
  }
  renderHub();
  renderQuests();
  updateQuestBadges();
  await animateCoinsToBar(questElForAnim || document.getElementById('questsList'), added);
  animateNumber(document.getElementById('hubCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('gameCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('questsCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('idolsCoins'), before, GAME_STATE.coins);
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) animateNumber(shopCoins, before, GAME_STATE.coins);
  await savePlayerState();
  } catch (_claimErr) {
    // Q-05 FIX: revert on failure
    q.claimed = false;
    GAME_STATE.coins = before;
    console.error('[claimQuest] failed, reverted:', _claimErr);
    showToast('Claim failed – please try again', 'error');
  } finally {
    q._claiming = false;
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
    el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:2px;line-height:1;">${prize}<img src="./imgs/assets/coins.png" style="width:0.82em;height:0.82em;margin-left:2px;"></span>`;
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
  const el = document.getElementById('dailyPrizeCoins');
  el.textContent = String(prize);
  const overlay = document.getElementById('dailyPrizeOverlay');
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeDailyPrizeOverlay() {
  document.getElementById('dailyPrizeOverlay').classList.remove('show');
  document.getElementById('dailyPrizeOverlay').setAttribute('aria-hidden', 'true');
}

function spinDailyWheelFromOverlay() {
  if (!currentUser) return;
  ensureDailyResetIfNeeded();
  if (GAME_STATE.daily.hasDrawn) return;
  if (WHEEL_SPINNING) return;
  // PATCH S-04/G-06: lock out a second spin immediately so rapid taps
  // or closing-and-reopening the overlay cannot spin again.
  GAME_STATE.daily.hasDrawn = true;   // provisional – reverted if prize not claimed (browser refresh)
  WHEEL_SPINNING = true;
  savePlayerState();
  const btn = document.getElementById('wheelSpinBtn');
  btn.disabled = true;
  btn.textContent = '...';
  const prize = randomDailyPrize();
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
    beforeCoins: GAME_STATE.coins
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
  addCoinsToGame(prize, 'dailywheel');
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
const STAR_UPGRADE_PROB = {
  1: 0.50,
  2: 0.44,
  3: 0.3182,
  4: 0.2857,
};
const DAILY_BOX_REWARDS = {
  1: {
    coins: 100
  },
  2: {
    coins: 200
  },
  3: {
    coins: 500
  },
  4: {
    coins: 1000
  },
  5: {
    coins: 5000
  },
};

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
  return `+${reward.coins} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">`;
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
  addCoinsToGame((reward.coins || 0), 'dailybox');
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
    const img = `./imgs/${idol.key}/1.jpg`;
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
      <img id="dailyBoxFsImg" src="./imgs/boxes/1.jpg" alt="Daily Box" />
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
