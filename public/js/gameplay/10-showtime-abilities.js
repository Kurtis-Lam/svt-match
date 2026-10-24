async function maybeApplyPendingLevelUp() {
  // L99 FIX: level is now incremented immediately inside levelComplete(),
  // so we only need to clear the flag here (no double-increment).
  if (GAME_STATE.pendingNextLevel) {
    GAME_STATE.pendingNextLevel = false;
    await savePlayerState();
  }
}

async function advanceLevelAndGoHub() {
  await maybeApplyPendingLevelUp();
  renderHub();
  showScreen('hubScreen');
}

async function advanceLevelAndGoHubFromPopup() {
  closeLevelCompleteOverlay();
  await advanceLevelAndGoHub();
}

async function nextLevelFromPopup() {
  closeLevelCompleteOverlay();
  await nextLevel();
}

function closeLevelCompleteOverlay() {
  document.getElementById('levelCompleteOverlay').classList.remove('show');
  document.getElementById('levelCompleteOverlay').setAttribute('aria-hidden', 'true');
}
let PENDING_DECK = null;

function resetRuntimeForLevel() {
  // Fix 5: do not reset kkuma flag after whistle
  GAME_STATE.runtime = {
    offsetSec: 0,
    blockFlipsDuringFreeze: false,
    frozenUntil: 0,
    slowUntil: 0,
    slowRate: 1,
    pausedAccumSec: 0,
    pauseStartMs: 0,
    activeUses: {},
    wonwooCharges: 0,
    wonwooHighlightSec: 1,
    wonwooArmed: false,
    wonwooActiveReveals: 0,
    wonwooTimerPaused: false,
    wonwooTimerFrozenSec: 0,
    vernonVibeArmed: false,
    vernonVibeDuration: 3,
    hoshiLeapArmed: false,
    hoshiLeapDuration: 2,
    lastFailedCards: [],
    flipSpeedMult: 2,
    revealAllActive: false,
    revealAllCancelToken: 0,
    abilityInProgress: false,
    mismatchAwaitingFlipBack: false,
  };
}

function ownedAbilityIds() {
  const ids = [];
  Object.values(ABILITIES).forEach(a => {
    if (isIdolOwned(a.ownerIdol)) ids.push(a.id);
  });
  return ids;
}

function pickRandomOffers(count = 4) {
  // All abilities are always available; power scales with ownership
  const pool = Object.keys(ABILITIES);
  shuffle(pool);
  return pool.slice(0, Math.min(count, pool.length));
}

function ownedIdolsCount() {
  return Object.keys(GAME_STATE.ownedIdols || {}).filter(k => GAME_STATE.ownedIdols[k]).length;
}

function abilitiesEnabledThisRun() {
  return true; // all players can use abilities
}

function ensureAbilityOfferLockForAttempt() {
  GAME_STATE.levelAbilities ||= {
    offered: [],
    selected: []
  };
  // For battles: always offer 4 random abilities from ALL idols at max power
  const ctx = GAME_STATE.battles?.active;
  if (ctx) {
    if (GAME_STATE.levelAbilities.offered && GAME_STATE.levelAbilities.offered.length) return;
    // Use shared offers from battle context (same for both players)
    const shared = ctx.sharedAbilityOffers || [];
    if (shared.length) {
      GAME_STATE.levelAbilities = {
        offered: [...shared],
        selected: [],
        battleMode: true
      };
    } else {
      const allIds = Object.keys(ABILITIES);
      const arr = [...allIds];
      shuffle(arr);
      GAME_STATE.levelAbilities = {
        offered: arr.slice(0, 4),
        selected: [],
        battleMode: true
      };
    }
    return;
  }
  // abilities always enabled for all players
  // (power 1 for non-owned, upgradeable for owned)
  if (GAME_STATE.levelAbilities.offered && GAME_STATE.levelAbilities.offered.length) return;
  GAME_STATE.levelAbilities = {
    offered: pickRandomOffers(4),
    selected: []
  };
}

function openAbilitySelectOverlay() {
  const overlay = document.getElementById('abilitySelectOverlay');
  const isBattle = !!GAME_STATE.battles?.active;
  if (!isBattle && !abilitiesEnabledThisRun()) {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    resetRuntimeForLevel();
    renderAbilityBar();
    // CHANGE: do not start timer here
    startLevelAfterAbilityConfirm();
    return;
  }
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  ensureAbilityOfferLockForAttempt();
  renderAbilitySelectList();
  updateAbilitySelectTotals();
}

function closeAbilitySelectOverlay(cancel = false) {
  const overlay = document.getElementById('abilitySelectOverlay');
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  if (cancel) {
    PENDING_DECK = null;
    GAME_STATE.inLevel = false;
    GAME_STATE.battles.active = null; // ← clear battle context
    // ---- keep offered abilities (do NOT reset) ----
    showScreen('hubScreen');
  }
}

function formatAbilityDescForOffer(a, power) {
  const dyn = abilityDynamicLine(a.id, power);
  const typeLabel = ""; // all abilities are active
  const idolName = IDOLS.find(i => i.key === a.ownerIdol)?.display || a.ownerIdol;
  return `
    <div class="text-xs text-gray-600 mt-1">${dyn || (a.description || "")}</div>
    <div class="mt-2 text-[11px] font-extrabold text-gray-500">${idolName} • ${a.type === "stackable" ? "Stackable" : "Instantaneous"} • P${power}</div>
  `;
}

function renderAbilitySelectList() {
  const host = document.getElementById('abilitySelectList');
  host.innerHTML = "";
  const offered = GAME_STATE.levelAbilities.offered || [];
  if (!offered.length) {
    host.innerHTML = `<div class="glass-card rounded-2xl p-4 text-sm text-gray-600">No abilities available (buy idols to unlock abilities).</div>`;
    return;
  }
  offered.forEach(id => {
    const a = ABILITIES[id];
    if (!a) return;
    const power = getIdolPower(a.ownerIdol);
    const selected = GAME_STATE.levelAbilities.selected.includes(a.id);
    const idolName = IDOLS.find(i => i.key === a.ownerIdol)?.display || a.ownerIdol;
    const rar = IDOL_RARITY[a.ownerIdol] || "rare";
    const col = rarityDotColor(rar);
    const img = `/imgs/${a.ownerIdol}/1.jpg`;
    const row = document.createElement('button');
    row.className = `glass-card rounded-2xl p-3 w/full text-left ${selected ? 'ring-2 ring-blue-500' : ''}`;
    row.onclick = () => toggleAbilitySelected(a.id);
    row.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <img src="${img}" alt="${idolName}" class="w-12 h-12 rounded-2xl object-cover border border-white/60 bg-white" />
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="rarity-dot" style="background:${col}"></span>
              <p class="font-extrabold text-gray-900 truncate">${a.label}</p>
            </div>
            ${formatAbilityDescForOffer(a, power)}
          </div>
        </div>
        <div class="text-right">
          <div class="text-[11px] ${selected ? 'text-blue-600' : 'text-gray-400'} font-extrabold mt-1">${selected ? 'Selected' : 'Tap'}</div>
        </div>
      </div>
    `;
    host.appendChild(row);
  });
}

function toggleAbilitySelected(abilityId) {
  const sel = GAME_STATE.levelAbilities.selected || [];
  const idx = sel.indexOf(abilityId);
  if (idx >= 0) sel.splice(idx, 1);
  else {
    if (sel.length >= 2) {
      showToast('You can select only 2 abilities', 'info');
      return;
    }
    sel.push(abilityId);
  }
  GAME_STATE.levelAbilities.selected = sel;
  renderAbilitySelectList();
  updateAbilitySelectTotals();
}

function updateAbilitySelectTotals() {
  const sel = GAME_STATE.levelAbilities.selected || [];
  document.getElementById('abilitySelectCount').textContent = String(sel.length);
  const btn = document.getElementById('abilitySelectConfirmBtn');
  const offeredCount = (GAME_STATE.levelAbilities.offered || []).length;
  const required = Math.min(2, offeredCount);
  // G-10 FIX: confirm is valid when 1..required abilities are selected
  if (sel.length < 1 || sel.length > required) {
    btn.disabled = true;
    btn.classList.add('opacity-60');
  } else {
    btn.disabled = false;
    btn.classList.remove('opacity-60');
  }
}

function selectedAbilities() {
  return (GAME_STATE.levelAbilities.selected || []).map(id => ABILITIES[id]).filter(Boolean);
}

function selectedPassives() {
  return selectedAbilities().filter(a => a.type === "passive");
}

function selectedActives() {
  return selectedAbilities(); // use all abilities
}

function canUseAbility(abilityId) {
  if (!abilitiesEnabledThisRun()) return false;
  return (GAME_STATE.levelAbilities.selected || []).includes(abilityId);
}

function markAbilityUsed(abilityId) {
  GAME_STATE.runtime.activeUses ||= {};
  GAME_STATE.runtime.activeUses[abilityId] = true;
  const pill = document.getElementById(`use_${abilityId}`);
  if (pill) pill.textContent = "USED";
  const btns = [...document.querySelectorAll('#abilityBarBtns .ability-btn')];
  btns.forEach(b => {
    const pillEl = b.querySelector(`#use_${abilityId}`);
    if (pillEl) b.disabled = true;
  });
}

function setOtherActiveAbilitiesDisabled(currentAbilityId, disabled) {
  const buttons = document.querySelectorAll('#abilityBarBtns .ability-btn');
  buttons.forEach(btn => {
    const pillEl = btn.querySelector('.use');
    if (!pillEl) return;
    const thisId = pillEl.id?.replace('use_', '');
    if (!thisId) return;
    if (thisId !== currentAbilityId && !GAME_STATE.runtime.activeUses[thisId]) {
      btn.disabled = disabled;
    }
  });
}

function enableRemainingActiveAbilities() {
  const buttons = document.querySelectorAll('#abilityBarBtns .ability-btn');
  buttons.forEach(btn => {
    const pillEl = btn.querySelector('.use');
    if (!pillEl) return;
    const thisId = pillEl.id?.replace('use_', '');
    if (!thisId) return;
    if (!GAME_STATE.runtime.activeUses[thisId]) {
      btn.disabled = false;
    }
  });
}

function pauseTimerFor(sec) {
  const now = performance.now();
  // G-04 FIX: always extend frozenUntil; only set pauseStartMs if not already paused
  GAME_STATE.runtime.frozenUntil = Math.max(GAME_STATE.runtime.frozenUntil || 0, now + sec * 1000);
  if (!GAME_STATE.runtime.pauseStartMs) {
    GAME_STATE.runtime.pauseStartMs = now;
  }
  // Fix 3: store displayed time at freeze start so it stays frozen
  if (GAME_STATE.startTime != null) {
    GAME_STATE.runtime.frozenUntilAtDisplay = computeTimeAt(now);
  }
}

function resumeTimerIfPaused() {
  if (!GAME_STATE.runtime.pauseStartMs) return;
  const now = performance.now();
  const pausedSec = (now - GAME_STATE.runtime.pauseStartMs) / 1000;
  GAME_STATE.runtime.pausedAccumSec += pausedSec;
  GAME_STATE.runtime.pauseStartMs = 0;
}

function getDisplayedTimeSec() {
  if (GAME_STATE.startTime == null) return 0;
  if (GAME_STATE.runtime.wonwooTimerPaused) return GAME_STATE.runtime.wonwooTimerFrozenSec;
  const now = performance.now();
  if (now < (GAME_STATE.runtime.frozenUntil || 0)) {
    const t = ((GAME_STATE.runtime.frozenUntilAtDisplay ?? null) == null) ? computeTimeAt(now) : GAME_STATE.runtime.frozenUntilAtDisplay;
    GAME_STATE.runtime.frozenUntilAtDisplay = t;
    return t;
  } else {
    if (GAME_STATE.runtime.frozenUntilAtDisplay != null) {
      resumeTimerIfPaused();
      GAME_STATE.runtime.frozenUntilAtDisplay = null;
    }
  }
  return computeTimeAt(now);
}

function computeTimeAt(nowMs) {
  const base = (nowMs - GAME_STATE.startTime) / 1000;
  let t = base - (GAME_STATE.runtime.pausedAccumSec || 0) + (GAME_STATE.runtime.offsetSec || 0);
  if (nowMs < (GAME_STATE.runtime.slowUntil || 0)) {
    const rate = GAME_STATE.runtime.slowRate || 0.5;
    const slowStart = GAME_STATE.runtime.slowStartMs || GAME_STATE.startTime;
    const tBeforeSlow = (slowStart - GAME_STATE.startTime) / 1000 - (GAME_STATE.runtime.pausedAccumSec || 0) + (GAME_STATE.runtime.offsetSec || 0);
    const tDuring = Math.max(0, (nowMs - slowStart) / 1000);  // G-12 FIX: clamp to 0
    t = tBeforeSlow + tDuring * rate;
  }
  return Math.max(0, t);
}
// CHANGE: timer starts on first action (first flip or first ability use)

function startTimerIfNeeded() {
  if (GAME_STATE.timerId) return;
  if (GAME_STATE.startTime != null) return;
  startTimer();
}

function getAdjacentCards(cardEl) {
  const allCards = getAllCardElements();
  const idx = allCards.indexOf(cardEl);
  if (idx < 0) return [];
  const COLS = 4;
  const adjacent = [];
  if (idx - COLS >= 0) adjacent.push(allCards[idx - COLS]);
  if (idx + COLS < allCards.length) adjacent.push(allCards[idx + COLS]);
  if (idx % COLS !== 0) adjacent.push(allCards[idx - 1]);
  if ((idx + 1) % COLS !== 0 && idx + 1 < allCards.length) adjacent.push(allCards[idx + 1]);
  return adjacent.filter(c => c && !c.classList.contains('matched'));
}

function showTigerOnCard(cardEl, durationSec) {
  const tiger = document.createElement('img');
  tiger.src = '/imgs/assets/hoshi_tiger.png';
  tiger.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:10;pointer-events:none;border-radius:inherit;';
  cardEl.style.position = 'relative';
  cardEl.appendChild(tiger);
  setTimeout(() => tiger.remove(), Math.max(200, durationSec * 1000));
}

function pauseTimerForWonwoo() {
  GAME_STATE.runtime.wonwooTimerFrozenSec = getDisplayedTimeSec();
  GAME_STATE.runtime.wonwooTimerPaused = true;
}

function resumeTimerForWonwoo() {
  if (!GAME_STATE.runtime.wonwooTimerPaused) return;
  const frozenSec = GAME_STATE.runtime.wonwooTimerFrozenSec;
  const now = performance.now();
  const realTime = computeTimeAt(now);
  GAME_STATE.runtime.offsetSec += frozenSec - realTime;
  GAME_STATE.runtime.wonwooTimerPaused = false;
  GAME_STATE.runtime.wonwooTimerFrozenSec = 0;
}

async function useActiveAbility(abilityId) {
  // Pause all stackable effects before using any ability (unless instantaneous)
  const isInstant = (ABILITIES[abilityId]?.type === 'instantaneous');
  if (!isInstant) {
    _pauseAllStackableEffects();
  }
  if (!canUseAbility(abilityId)) return;
  if (GAME_STATE.runtime.activeUses?.[abilityId]) return;
  if (GAME_STATE.runtime.abilityInProgress) return;
  GAME_STATE.runtime.abilityInProgress = true;
  startTimerIfNeeded();
  const a = ABILITIES[abilityId];
  if (!a) {
    GAME_STATE.runtime.abilityInProgress = false;
    return;
  }
  const lvl = getIdolPower(a.ownerIdol);
  const eff = a.effectAtPower ? a.effectAtPower(lvl) : {};
  const finishAbilityUse = () => {
    enableRemainingActiveAbilities();
    GAME_STATE.runtime.abilityInProgress = false;
  };
  if (abilityId !== "seungkwan_rewind") {
    markAbilityUsed(abilityId);
    setOtherActiveAbilitiesDisabled(abilityId, true);
  }
  if (!isInstant) _resumeAllStackableEffects();  // G-05 FIX: don't resume for instantaneous abilities
  // Clear any pending mismatch state before ability
  if (GAME_STATE.runtime.mismatchAwaitingFlipBack) {
    if (GAME_STATE.firstPick && !GAME_STATE.firstPick.dataset.permanent) GAME_STATE.firstPick.classList.remove('flipped');
    if (GAME_STATE.secondPick && !GAME_STATE.secondPick.dataset.permanent) GAME_STATE.secondPick.classList.remove('flipped');
    GAME_STATE.runtime.mismatchAwaitingFlipBack = false;
    GAME_STATE.lockExposure = false;
    resetPicks();
  }
  try {
    if (abilityId === "scoups_whistle") {
      await scoupsGeneralWhistle(eff.durationSec || 5);
      return finishAbilityUse();
    }
    if (abilityId === "seungkwan_rewind") {
      const t = getDisplayedTimeSec();
      const target = eff.targetSec ?? 19;
      if (t <= target) {
        showToast(`Only usable after ${target.toFixed(2)}s`, "error");
        // Reset ability‑in‑progress so other actions work
        GAME_STATE.runtime.abilityInProgress = false;
        return;
      }
      // SUCCESS – now mark as used
      markAbilityUsed(abilityId);
      setOtherActiveAbilitiesDisabled(abilityId, true);
      GAME_STATE.runtime.offsetSec += target - t;
      showToast(`Rewound to ${target.toFixed(2)}s!`, "success");
      finishAbilityUse();
      return;
    }
    if (abilityId === "joshua_rain") {
      const now = performance.now();
      GAME_STATE.runtime.slowRate = eff.rate || 0.5;
      GAME_STATE.runtime.slowStartMs = now;
      GAME_STATE.runtime.slowUntil = now + (eff.durationSec || 5) * 1000;
      showToast("Timer slowed!", "info");
      return finishAbilityUse();
    }
    if (abilityId === "mingyu_aura") {
      const dur = eff.durationSec || 2.5;
      pauseTimerFor(dur);
      const unflipped = getAllCardElements().filter(c => !c.classList.contains('matched') && !c.classList.contains('flipped') && !c.dataset.permanent);
      const revealCount = Math.max(1, Math.floor(unflipped.length / 2));
      shuffle(unflipped);
      const picks = unflipped.slice(0, revealCount);
      picks.forEach(c => c.classList.add('flipped'));
      GAME_STATE.runtime.blockFlipsDuringFreeze = true;
      showToast("Clumsy Crash!", "info");
      setTimeout(() => {
        picks.forEach(c => {
          if (!c.classList.contains('matched') && !c.dataset.permanent) c.classList.remove('flipped');
        });
        GAME_STATE.runtime.blockFlipsDuringFreeze = false;
        finishAbilityUse();
      }, Math.max(200, dur * 1000));
      return;
    }
    if (abilityId === "jeonghan_cheat") {
      const dur = eff.durationSec || 4;
      pauseTimerFor(dur);
      showToast(`Timer frozen for ${dur.toFixed(2)}s!`, "info");
      setTimeout(finishAbilityUse, Math.max(200, dur * 1000));
      return;
    }
    if (abilityId === "dk_slash") {
      await dkRevealRow(eff.totalSec || 6);
      return finishAbilityUse();
    }
    if (abilityId === "vernon_vibe") {
      GAME_STATE.runtime.vernonVibeArmed = true;
      GAME_STATE.runtime.vernonVibeDuration = eff.durationSec || 3;
      GAME_STATE.runtime.vernonVibeFinish = finishAbilityUse;  // G-08 FIX: defer finish
      showToast("Vibe Check — tap a card!", "info");
      // NOTE: finishAbilityUse() called by the tap handler after the reveal resolves
      return;
    }
    if (abilityId === "dino_history") {
      const dur = eff.durationSec || 1;
      const lastPair = GAME_STATE.runtime.lastMismatchedPair; // { cards: [el1, el2], matchKeys: [key1, key2] }
      if (!lastPair || !lastPair.cards || lastPair.cards.length !== 2) {
        showToast("No mismatched pair recorded!", "info");
        return finishAbilityUse();
      }
      pauseTimerFor(dur + 0.2);
      const [c1, c2] = lastPair.cards;
      const [k1, k2] = lastPair.matchKeys;
      // Reveal the two mismatched cards if still unmatched
      if (c1 && !c1.classList.contains('matched')) c1.classList.add('flipped');
      if (c2 && !c2.classList.contains('matched')) c2.classList.add('flipped');
      // Find their actual matching partners
      const allCards = getAllCardElements();
      const partner1 = allCards.find(c => c.dataset.matchKey === k1 && c !== c1 && !c.classList.contains('matched'));
      const partner2 = allCards.find(c => c.dataset.matchKey === k2 && c !== c2 && !c.classList.contains('matched'));
      if (partner1) partner1.classList.add('flipped');
      if (partner2) partner2.classList.add('flipped');
      showToast("History Maker!", "info");
      setTimeout(() => {
        [c1, c2, partner1, partner2].forEach(c => {
          if (c && !c.classList.contains('matched') && !c.dataset.permanent) c.classList.remove('flipped');
        });
        finishAbilityUse();
      }, Math.max(200, dur * 1000));
      return;
    }
    if (abilityId === "hoshi_leap") {
      GAME_STATE.runtime.hoshiLeapArmed = true;
      GAME_STATE.runtime.hoshiLeapDuration = eff.matchTimeSec || 2;
      GAME_STATE.runtime.hoshiLeapFinish = finishAbilityUse;  // G-07 FIX: defer finish
      showToast("Tiger's Leap — tap a card to auto-match!", "info");
      // NOTE: finishAbilityUse() called by the tap handler after the match resolves
      return;
    }
    if (abilityId === "woozi_reset") {
      await wooziReorderFractionalRemaining(eff.fraction || 0.25);
      return finishAbilityUse();
    }
    if (abilityId === "jun_miracle") {
      await junRemoveRandomPairNoReorder(eff.ms || 1200);
      return finishAbilityUse();
    }
    if (abilityId === "wonwoo_hack") {
      GAME_STATE.runtime.wonwooCharges = eff.charges || 3;
      GAME_STATE.runtime.wonwooHighlightSec = eff.highlightSec || 1;
      GAME_STATE.runtime.wonwooArmed = true;
      GAME_STATE.runtime.wonwooActiveReveals = 0;
      pauseTimerForWonwoo();
      showToast(`System Hack: ${GAME_STATE.runtime.wonwooCharges} taps — timer paused`, "success");
      return finishAbilityUse();
    }
    if (abilityId === "the8_tea") {
      const count = eff.count || 1;
      // Collect unmatched, not-yet-permanent cards
      const candidates = getAllCardElements().filter(c => !c.classList.contains('matched') && !c.dataset.permanent);
      if (!candidates.length) {
        showToast("No unmatched cards left!", "info");
        return finishAbilityUse();
      }
      // Pick `count` DISTINCT match-keys so we don't reveal both halves of a pair
      // (revealing only ONE card of each pair forces the player to still find its partner)
      shuffle(candidates);
      const picked = [];
      const usedKeys = new Set();
      for (const c of candidates) {
        if (picked.length >= count) break;
        if (!usedKeys.has(c.dataset.matchKey)) {
          usedKeys.add(c.dataset.matchKey);
          picked.push(c);
        }
      }
      // Mark each picked card: permanently visible + flipped face-up
      picked.forEach(c => {
        c.classList.add('flipped');
        c.dataset.permanent = 'true';
        // Visual indicator: soft gold border so player can see which are "Tea" cards
        c.style.outline = '3px solid rgba(251,191,36,0.85)';
        c.style.outlineOffset = '2px';
      });
      // Clear any in-progress mismatch so the board isn't locked
      if (GAME_STATE.runtime.mismatchAwaitingFlipBack) {
        getAllCardElements().forEach(c => {
          if (c.classList.contains('flipped') && !c.classList.contains('matched') && !c.dataset.permanent) {
            c.classList.remove('flipped');
          }
        });
        resetPicks();
        GAME_STATE.runtime.mismatchAwaitingFlipBack = false;
        GAME_STATE.lockExposure = false;
      }
      showToast(`Tea Time: ${picked.length} card${picked.length > 1 ? 's' : ''} revealed — tap the match to complete!`, "info");
      return finishAbilityUse();
    }
    finishAbilityUse();
  } catch (e) {
    finishAbilityUse();
  }
}

function revealRandomCardsUnflipped(count, sec) {
  const cards = getAllCardElements().filter(c => !c.classList.contains('matched') && !c.classList.contains('flipped'));
  if (!cards.length) return;
  shuffle(cards);
  const picks = cards.slice(0, Math.min(count, cards.length));
  picks.forEach(c => c.classList.add('flipped'));
  setTimeout(() => {
    picks.forEach(c => {
      if (!c.classList.contains('matched')) c.classList.remove('flipped');
    });
  }, Math.max(160, sec * 1000));
}

function getAllCardElements() {
  return [...document.querySelectorAll('#cardGrid .card')];
}

async function scoupsGeneralWhistle(durationSec) {
  const token = ++GAME_STATE.runtime.revealAllCancelToken;
  GAME_STATE.lock = true;
  GAME_STATE.runtime.revealAllActive = true;
  GAME_STATE.runtime.blockFlipsDuringFreeze = true;
  if (GAME_STATE.firstPick && GAME_STATE.firstPick.classList.contains('flipped') && !GAME_STATE.firstPick.classList.contains('matched')) {
    GAME_STATE.firstPick.classList.remove('flipped');
  }
  if (GAME_STATE.secondPick && GAME_STATE.secondPick.classList.contains('flipped') && !GAME_STATE.secondPick.classList.contains('matched')) {
    GAME_STATE.secondPick.classList.remove('flipped');
  }
  resetPicks();
  pauseTimerFor(durationSec);
  const cards = getAllCardElements().filter(c => !c.classList.contains('matched') && c.dataset.permanent !== 'true');
  cards.forEach(c => c.classList.add('flipped'));
  showToast("All cards revealed!", "info");
  await sleep(Math.max(200, durationSec * 1000));
  if (token !== GAME_STATE.runtime.revealAllCancelToken) return;
  cards.forEach(c => {
    if (!c.classList.contains('matched') && !c.dataset.permanent) c.classList.remove('flipped');
  });
  GAME_STATE.runtime.revealAllActive = false;
  GAME_STATE.runtime.blockFlipsDuringFreeze = false;
  GAME_STATE.lock = false;
  // Fix 5: do not reset kkuma flag after whistle
}

function cardsByRow() {
  const cards = getAllCardElements();
  const rows = [
    [],
    [],
    [],
    []
  ];
  cards.forEach((c, i) => {
    const r = Math.floor(i / 4);
    if (!rows[r]) rows[r] = [];
    rows[r].push(c);
  });
  return rows.filter(r => r.length);
}

async function dkRevealRow(totalSec) {
  const rows = cardsByRow();
  if (!rows.length) return;
  // Fix 10: filter rows without permanent cards; fallback to any row if none
  const rowsWithoutPerm = rows.filter(r => r.every(c => c.dataset.permanent !== 'true'));
  let candidates = rowsWithoutPerm.length > 0 ? rowsWithoutPerm : rows;
  const score = (row) => row.filter(c => !c.classList.contains('matched') && c.classList.contains('flipped')).length;
  let best = candidates[0];
  candidates.forEach(r => {
    if (score(r) < score(best)) best = r;
  });
  const revealables = best.filter(c => !c.classList.contains('matched'));
  if (!revealables.length) return;
  pauseTimerFor(totalSec);
  GAME_STATE.runtime.blockFlipsDuringFreeze = true;
  const per = (totalSec * 1000) / 4;
  showToast("X-Calibur Slash!", "info");
  for (let i = 0; i < revealables.length; i++) {
    const c = revealables[i];
    if (!c.classList.contains('matched')) c.classList.add('flipped');
    await sleep(per);
  }
  revealables.forEach(c => {
    if (!c.classList.contains('matched') && !c.dataset.permanent) c.classList.remove('flipped');
  });
  GAME_STATE.runtime.blockFlipsDuringFreeze = false;
}

async function wooziReorderFractionalRemaining(fraction) {
  const grid = document.getElementById('cardGrid');
  const allCards = getAllCardElements();
  // ----- 1. Safety: cancel any stuck mismatch state -----
  if (GAME_STATE.runtime.mismatchAwaitingFlipBack) {
    allCards.forEach(c => {
      if (!c.classList.contains('matched') && !c.dataset.permanent) c.classList.remove('flipped');
    });
    resetPicks();
    GAME_STATE.runtime.mismatchAwaitingFlipBack = false;
    GAME_STATE.lockExposure = false;
  }
  // ----- 2. Select movable cards (unmatched, not permanent) -----
  const movable = allCards.filter(c => !c.classList.contains('matched') && c.dataset.permanent !== 'true');
  if (movable.length < 2) return;
  // ----- 3. Group movable cards by idol -----
  const groups = {};
  movable.forEach(c => {
    const idol = c.dataset.matchKey;
    if (!groups[idol]) groups[idol] = [];
    groups[idol].push(c);
  });
  const idolKeys = Object.keys(groups).filter(k => groups[k].length >= 2);
  if (!idolKeys.length) return;
  // ----- 4. Calculate how many idols to pick -----
  const totalMovable = movable.length;
  let takeCountRaw = Math.ceil(totalMovable * fraction);
  if (takeCountRaw % 2 !== 0) takeCountRaw += 1;
  const takePairs = Math.max(1, takeCountRaw / 2);
  // ----- 5. Randomly pick that many idols -----
  shuffle(idolKeys);
  const selectedIdols = idolKeys.slice(0, Math.min(takePairs, idolKeys.length));
  // ----- 6. Collect all cards of those idols, then GROUP BY IDOL -----
  let chosenCards = [];
  selectedIdols.forEach(key => {
    chosenCards = chosenCards.concat(groups[key]);
  });
  // ▼▼▼ FIX: keep AABB ordering ▼▼▼
  const chosenGroups = {};
  chosenCards.forEach(c => {
    const key = c.dataset.matchKey;
    if (!chosenGroups[key]) chosenGroups[key] = [];
    chosenGroups[key].push(c);
  });
  const groupKeys = Object.keys(chosenGroups);
  shuffle(groupKeys); // shuffle only the order of the PAIRS
  chosenCards = [];
  groupKeys.forEach(key => {
    chosenCards = chosenCards.concat(chosenGroups[key]); // pairs stay side‑by‑side
  });
  // ▲▲▲ FIX: ensure AABB order ▲▲▲
  const chosenSet = new Set(chosenCards);
  const restCards = movable.filter(c => !chosenSet.has(c));
  // ----- 7. Build the new DOM order -----
  const allChildren = [...grid.children];
  const newOrder = allChildren.map(child => {
    if (child.classList.contains('matched') || child.dataset.permanent === 'true') {
      return child;
    }
    if (chosenCards.length > 0) {
      const c = chosenCards.shift();
      return c;
    } else if (restCards.length > 0) {
      const c = restCards.shift();
      return c;
    } else {
      return child;
    }
  });
  // ----- 8. Record old positions before changing the DOM -----
  const oldPositions = {};
  allCards.forEach(c => {
    oldPositions[c.dataset.cardId] = c.getBoundingClientRect();
  });
  // ----- 9. Apply new order (lock board temporarily) -----
  GAME_STATE.lock = true;
  grid.innerHTML = '';
  newOrder.forEach(card => grid.appendChild(card));
  // ----- 10. Animate cards from old to new positions -----
  getAllCardElements().forEach(card => {
    const old = oldPositions[card.dataset.cardId];
    if (!old) return;
    const newRect = card.getBoundingClientRect();
    const dx = old.left - newRect.left;
    const dy = old.top - newRect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)';
        card.style.transform = 'translate(0, 0)';
      });
    });
  });
  await sleep(550);
  // Clean up transforms
  getAllCardElements().forEach(c => {
    c.style.transition = '';
    c.style.transform = '';
  });
  GAME_STATE.lock = false;
  showToast("Factory Reset!", "info");
}

async function junRemoveRandomPairNoReorder(ms) {
  const cards = getAllCardElements().filter(c => !c.classList.contains('matched') && c.dataset.permanent !== 'true');
  const groups = {};
  cards.forEach(c => {
    (groups[c.dataset.matchKey] ||= []).push(c);
  });
  const keys = Object.keys(groups).filter(k => groups[k].length >= 2);
  if (!keys.length) return;
  const key = keys[Math.floor(Math.random() * keys.length)];
  const pair = groups[key].slice(0, 2);
  GAME_STATE.lock = true;
  if (GAME_STATE.firstPick && !GAME_STATE.firstPick.classList.contains('matched')) GAME_STATE.firstPick.classList.remove('flipped');
  if (GAME_STATE.secondPick && !GAME_STATE.secondPick.classList.contains('matched')) GAME_STATE.secondPick.classList.remove('flipped');
  resetPicks();
  pair.forEach(c => {
    c.classList.add('locked');
    c.style.willChange = 'transform, opacity';
    c.style.transition = `transform ${ms}ms cubic-bezier(0.15,0.8,0.2,1), opacity ${ms}ms ease`;
    const dx = (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 220);
    const dy = (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 240);
    c.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${(Math.random()-0.5)*20}deg) scale(0.92)`;
    c.style.opacity = '0';
  });
  pair.forEach(c => c.classList.add('matched'));
  GAME_STATE.matchedPairs += 1;
  resetPicks();
  document.getElementById('matchesCount').textContent = String(GAME_STATE.matchedPairs);
  GAME_STATE.stats.idolMatches[key] = (GAME_STATE.stats.idolMatches[key] || 0) + 1;
  if (!isBattleRunActive()) updateTieredQuestsAfterMatch(key);
  await sleep(ms + 60);
  pair.forEach(c => c.remove());
  showToast("Moonwalker's Miracle!", "info");
  GAME_STATE.lock = false;
  if (GAME_STATE.matchedPairs >= 8) await levelComplete();
}

function animateTigerLeap(fromCard, toCard, durationSec) {
  const app = document.getElementById('app');
  const appRect = app.getBoundingClientRect();
  const fRect = fromCard.getBoundingClientRect();
  const tRect = toCard.getBoundingClientRect();
  const fromX = (fRect.left + fRect.right) / 2 - appRect.left - 24;
  const fromY = (fRect.top + fRect.bottom) / 2 - appRect.top - 24;
  const toX = (tRect.left + tRect.right) / 2 - appRect.left - 24;
  const toY = (tRect.top + tRect.bottom) / 2 - appRect.top - 24;
  const tiger = document.createElement('img');
  tiger.src = '/imgs/assets/hoshi_tiger.png';
  tiger.style.cssText = ['position:absolute', `left:${fromX}px`, `top:${fromY}px`, 'width:48px', 'height:48px', 'z-index:200', 'pointer-events:none', 'filter:drop-shadow(0 6px 12px rgba(0,0,0,0.35))', 'transition:none', 'will-change:left,top,transform', ].join(';');
  const fxLayer = document.getElementById('abilityFxLayer');
  fxLayer.appendChild(tiger);
  const ms = Math.max(300, durationSec * 1000);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      tiger.style.transition = `left ${ms}ms cubic-bezier(0.25,0.8,0.15,1), top ${ms}ms cubic-bezier(0.25,0.8,0.15,1), transform ${ms}ms ease`;
      tiger.style.left = `${toX}px`;
      tiger.style.top = `${toY}px`;
      tiger.style.transform = 'scale(1.4) rotate(-20deg)';
    });
  });
  setTimeout(() => {
    tiger.style.transition = 'transform 0.2s ease, opacity 0.25s ease';
    tiger.style.transform = 'scale(0)';
    tiger.style.opacity = '0';
    setTimeout(() => tiger.remove(), 260);
  }, ms - 40);
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function confirmAbilitiesAndStart() {
  const sel = GAME_STATE.levelAbilities.selected || [];
  const offeredCount = (GAME_STATE.levelAbilities.offered || []).length;
  const required = Math.min(2, offeredCount);
  if (sel.length !== required) {
    showToast(`Pick exactly ${required} ability${required===1?'':'ies'}`, 'error');
    return;
  }
  const overlay = document.getElementById('abilitySelectOverlay');
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  resetRuntimeForLevel();
  // // applySelectedPassivesOnLevelStart() – passives removed (removed)
  renderAbilityBar();
  // CHANGE: do not start timer here
  startLevelAfterAbilityConfirm();
}

function backFromGame() {
  if (GAME_STATE.battles?.active) {
    showToast("Cannot quit a battle", "error");
    return;
  }
  if (GAME_STATE.levelJustFinished) {
    showToast("Choose Back to Hub or Next Level", "info");
    return;
  }
  confirmExitGame();
}

function renderAbilityBar() {
  const bar = document.getElementById('abilityBar');
  const btnsHost = document.getElementById('abilityBarBtns');
  if (!bar || !btnsHost) return;
  const abilities = selectedActives(); // all selected active abilities
  if (abilities.length === 0) {
    bar.classList.add('hidden');
    btnsHost.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  btnsHost.innerHTML = '';
  abilities.forEach(a => {
    const power = getIdolPower(a.ownerIdol);
    const imgSrc = `/imgs/${a.ownerIdol}/1.jpg`;
    const idolName = IDOLS.find(i => i.key === a.ownerIdol)?.display || a.ownerIdol;
    const used = !!GAME_STATE.runtime.activeUses[a.id];
    const btn = document.createElement('button');
    btn.className = 'ability-btn' + (used ? ' used' : '');
    btn.disabled = used;
    btn.innerHTML = `
      <div class="left">
        <img src="${imgSrc}" alt="${idolName}" />
        <div>
          <div class="name">${a.label}</div>
        </div>
      </div>
      <span class="use" id="use_${a.id}">${used ? 'USED' : 'USE'}</span>
    `;
    btn.addEventListener('click', () => useActiveAbility(a.id));
    btnsHost.appendChild(btn);
  });
}
