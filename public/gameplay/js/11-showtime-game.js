// File: public/gameplay/js/11-showtime-game.js
const __preloadedUrls = new Set();
const __preloadQueue = [];
let __preloadPumping = false;
// Warms the cache a few images at a time, at low priority, only when the
// browser is idle – so the images the player actually needs load first.
function lowPriorityPreload(urls) {
  urls.forEach(u => { if (!__preloadedUrls.has(u)) { __preloadedUrls.add(u); __preloadQueue.push(u); } });
  if (__preloadPumping) return;
  __preloadPumping = true;
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200));
  const pump = () => {
    const batch = __preloadQueue.splice(0, 4);
    batch.forEach(src => {
      const img = new Image();
      try { img.fetchPriority = 'low'; } catch (e) {}
      img.decoding = 'async';
      img.src = src;
    });
    if (__preloadQueue.length) idle(pump); else __preloadPumping = false;
  };
  idle(pump);
}

function preloadShowtimeAssets() {
  const urls = [];
  // All idol images except 1.jpg
  Object.keys(IDOL_IMAGES).forEach(idolKey => {
    const files = IDOL_IMAGES[idolKey] || [];
    files.filter(f => f !== '1.jpg').forEach(f => {
      urls.push(`./imgs/${idolKey}/${f}`);
    });
  });
  // Daily box background
  urls.push('./imgs/boxes/background.jpg');
  // 5 box images
  for (let i = 1; i <= 5; i++) {
    urls.push(`./imgs/boxes/${i}.jpg`);
  }
  lowPriorityPreload(urls);
  return Promise.resolve();
}

async function startLevel() {
  try {
    await maybeApplyPendingLevelUp();
    GAME_STATE.inLevel = true;
    GAME_STATE.levelJustFinished = false;
    // Fix 5: do not reset kkuma flag after whistle
    GAME_STATE.matchedPairs = 0;
    GAME_STATE.firstPick = null;
    GAME_STATE.secondPick = null;
    GAME_STATE.lock = false;
    GAME_STATE.lockExposure = false;
    GAME_STATE.runtime.mismatchAwaitingFlipBack = false;
    document.getElementById('matchesCount').textContent = "0";
    document.getElementById('gameLevel').textContent = GAME_STATE.level;
    document.getElementById('gameCoins').textContent = Number(GAME_STATE.coins || 0).toLocaleString();
    document.getElementById('levelCompletePanel').classList.add('hidden');
    GAME_STATE.runtime.flipSpeedMult = 2;
    applyFlipSpeedCss();
    let deck;
    const battleCtx = GAME_STATE.battles?.active;
    if (battleCtx && battleCtx.sharedDeckSpec) {
      deck = buildDeckFromSpec(battleCtx.sharedDeckSpec);
    } else {
      const chosenIdols = pickIdolsForLevel(8);
      deck = [];
      for (const idol of chosenIdols) {
        const rarity = (IDOL_RARITY[idol.key] || "rare");
        const [img1, img2] = pickTwoDistinctImages(idol.key);
        deck.push(makeCardData(idol, rarity, img1));
        deck.push(makeCardData(idol, rarity, img2));
      }
      shuffle(deck);
    }
    PENDING_DECK = deck;
    GAME_STATE.currentLevelPairs = {};
    const _seenKeys = new Set();
    deck.forEach(card => {
      if (!_seenKeys.has(card.matchKey)) {
        _seenKeys.add(card.matchKey);
        GAME_STATE.currentLevelPairs[card.matchKey] = card.rarity;
      }
    });
    showScreen('gameScreen');
    // Hide back button if in battle
    const gameBack = document.getElementById('gameBackBtn');
    if (gameBack && (isBattleRunActive() || GAME_STATE.battles?.active)) {
      gameBack.style.display = 'none';
    } else {
      gameBack.style.display = '';
    }
    renderDeck(PENDING_DECK);
    preloadShowtimeAssets();
    const hud = document.getElementById('passiveHud');
    if (hud) hud.innerHTML = "";
    document.getElementById('abilityBar').classList.add('hidden');
    document.getElementById('abilityBarBtns').innerHTML = "";
    ensureAbilityOfferLockForAttempt();
    const offered = GAME_STATE.levelAbilities.offered || [];
    if (!isBattleRunActive() && (!abilitiesEnabledThisRun() || !offered.length)) {
      resetRuntimeForLevel();
      renderAbilityBar();
      startLevelAfterAbilityConfirm();
      return;
    }
    openAbilitySelectOverlay();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function startLevelAfterAbilityConfirm() {
  // CHANGE: defer timer start until first flip/ability use
  // BUG1 FIX: stop any running timer from the previous round so the
  // display actually resets to 0.0 instead of being overwritten by the
  // old setInterval tick immediately after we set it.
  stopTimer();
  showToast('Level started!', 'info');
  document.getElementById('gameTimer').textContent = '0.0';
}

function makeCardData(idol, rarity, filename) {
  return {
    id: `${idol.key}:${filename}:${Math.random().toString(16).slice(2)}`,
    matchKey: idol.key,
    idolKey: idol.key,
    idolName: idol.display,
    rarity,
    imgSrc: `./imgs/${idol.key}/${filename}`,
  };
}

function renderDeck(deck) {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  deck.forEach((card, idx) => {
    const el = document.createElement('button');
    el.className = `card ${RARITY_BORDER_CLASS[card.rarity] || ""}`;
    el.setAttribute('aria-label', `Card ${idx+1}`);
    el.dataset.cardId = card.id;
    el.dataset.matchKey = card.matchKey;
    el.dataset.rarity = card.rarity;
    el.dataset.idolKey = card.idolKey;
    el.dataset.imgSrc = card.imgSrc;
    el.style.setProperty('--i', String(idx));
    el.classList.add('svt-deal');
    el.addEventListener('animationend', () => el.classList.remove('svt-deal'), { once: true });
    el.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-back">
          <div class="logo">17</div>
        </div>
        <div class="card-face card-front">
          <img alt="${card.idolName}" src="${card.imgSrc}" loading="eager" decoding="async" draggable="false" />
          <div class="nameTag">
            <span>${card.idolName}</span>
          </div>
        </div>
      </div>
    `;
    el.addEventListener('click', () => onCardClick(el));
    frag.appendChild(el);
  });
  grid.appendChild(frag);
}

function isWonwooHackActive() {
  return canUseAbility("wonwoo_hack") && GAME_STATE.runtime.wonwooArmed && (GAME_STATE.runtime.wonwooCharges || 0) > 0;
}

function revealPairForCardAuto(cardEl, sec) {
  const key = cardEl.dataset.matchKey;
  const cards = getAllCardElements().filter(c => !c.classList.contains('matched') && c.dataset.matchKey === key);
  if (!cards.length) return;
  cards.forEach(c => c.classList.add('flipped'));
  highlightPairForKey(key, sec);
  setTimeout(() => {
    cards.forEach(c => {
      if (!c.classList.contains('matched')) c.classList.remove('flipped');
    });
  }, Math.max(160, sec * 1000));
}

async function onCardClick(cardEl) {
  if (GAME_STATE.runtime.revealAllActive) return;
  if (GAME_STATE._autoMatching) return;
  if (cardEl.classList.contains('matched')) return;
  // ── NEW: block all player flips while timer is frozen ────────────
  const _now = performance.now();
  if (_now < (GAME_STATE.runtime.frozenUntil || 0) && GAME_STATE.runtime.blockFlipsDuringFreeze) return;
  // ─────────────────────────────────────────────────────────────────
  startTimerIfNeeded();
  // ── THE8 TEA TIME: auto-match permanent cards ────────────────────
  // If this card's matchKey has a permanent (face-up) partner, auto-match both instantly.
  if (!cardEl.dataset.permanent) {
    const allCards = getAllCardElements();
    // Fix 7: cancel any pending mismatch before auto-match
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
    const permanentPartner = allCards.find(c => c !== cardEl && c.dataset.matchKey === cardEl.dataset.matchKey && c.dataset.permanent === 'true' && !c.classList.contains('matched'));
    if (permanentPartner) {
      // Flip the clicked card face-up so the player sees the match
      cardEl.classList.add('flipped');
      GAME_STATE.lock = true;
      GAME_STATE._autoMatching = true;
      // Brief pause so the player can see both before they lock
      await sleep(260);
      // Mark both matched
      cardEl.removeAttribute('data-permanent');
      permanentPartner.removeAttribute('data-permanent');
      cardEl.classList.add('matched', 'locked');
      permanentPartner.classList.add('matched', 'locked');
      GAME_STATE.matchedPairs += 1;
      resetPicks();
      document.getElementById('matchesCount').textContent = String(GAME_STATE.matchedPairs);
      const mKey = cardEl.dataset.matchKey;
      GAME_STATE.stats.idolMatches[mKey] = (GAME_STATE.stats.idolMatches[mKey] || 0) + 1;
      if (mKey === 'kkuma') GAME_STATE.kkumaMatchedThisLevel = true;
      if (!isBattleRunActive()) updateTieredQuestsAfterMatch(mKey); // P-03 FIX
      GAME_STATE.lock = false;
      GAME_STATE._autoMatching = false;
      resetPicks();
      if (GAME_STATE.matchedPairs >= 8 && !GAME_STATE._levelCompleteFiring) {
        GAME_STATE._levelCompleteFiring = true;
        try { await levelComplete(); } finally { GAME_STATE._levelCompleteFiring = false; }
      }
      return; // ← handled; skip normal flip logic entirely
    }
  }
  // ── Also: if player clicks a permanent card itself, treat it as a
  //    normal first-pick (pair it with the next card they tap) ──────
  // (falls through to normal logic below; permanent cards stay visible)
  // ─────────────────────────────────────────────────────────────────
  // ── Vernon Vibe Check armed ──────────────────────────────────────
  if (GAME_STATE.runtime.vernonVibeArmed) {
    if (cardEl.classList.contains('matched')) return;
    GAME_STATE.runtime.vernonVibeArmed = false;
    const dur = GAME_STATE.runtime.vernonVibeDuration || 3;
    pauseTimerFor(dur); // freeze timer
    if (!cardEl.classList.contains('flipped')) cardEl.classList.add('flipped'); // reveal tapped card
    const adjacent = getAdjacentCards(cardEl);
    adjacent.forEach(c => {
      if (!c.classList.contains('flipped')) c.classList.add('flipped');
    });
    showToast("Vibe Check!", "info");
    setTimeout(() => {
      if (!cardEl.classList.contains('matched') && !cardEl.dataset.permanent) cardEl.classList.remove('flipped');
      adjacent.forEach(c => {
        if (!c.classList.contains('matched') && !c.dataset.permanent) c.classList.remove('flipped');
      });
    }, dur * 1000);
    return;
  }
  // ── Hoshi Tiger's Leap armed ─────────────────────────────────────
  if (GAME_STATE.runtime.hoshiLeapArmed) {
    if (cardEl.classList.contains('flipped') || cardEl.classList.contains('matched')) return;
    GAME_STATE.runtime.hoshiLeapArmed = false;
    const dur = GAME_STATE.runtime.hoshiLeapDuration || 2;
    const allCards = getAllCardElements();
    const matchCard = allCards.find(c => c !== cardEl && c.dataset.matchKey === cardEl.dataset.matchKey && !c.classList.contains('matched') && !c.classList.contains('flipped'));
    if (matchCard) {
      pauseTimerFor(dur + 0.5);
      GAME_STATE.lock = true;
      // Flip both face-up briefly so player sees what was matched
      cardEl.classList.add('flipped');
      if (!matchCard.classList.contains('flipped')) matchCard.classList.add('flipped');
      // Animate tiger leaping from tapped card to match card
      animateTigerLeap(cardEl, matchCard, dur);
      showToast("Tiger's Leap! 🐯 Auto-matched!", "info");
      setTimeout(() => {
        // Mark both as matched
        cardEl.removeAttribute('data-permanent');
        matchCard.removeAttribute('data-permanent');
        cardEl.classList.add('matched', 'locked');
        matchCard.classList.add('matched', 'locked');
        GAME_STATE.matchedPairs += 1;
        resetPicks();
        resetPicks();
        document.getElementById('matchesCount').textContent = String(GAME_STATE.matchedPairs);
        const mKey = cardEl.dataset.matchKey;
        GAME_STATE.stats.idolMatches[mKey] = (GAME_STATE.stats.idolMatches[mKey] || 0) + 1;
        if (mKey === 'kkuma') GAME_STATE.kkumaMatchedThisLevel = true;
        if (!isBattleRunActive()) updateTieredQuestsAfterMatch(mKey); // P-04 FIX
        GAME_STATE.lock = false;
        if (GAME_STATE.runtime.hoshiLeapFinish) {
          GAME_STATE.runtime.hoshiLeapFinish();
          GAME_STATE.runtime.hoshiLeapFinish = null;
        }
        if (GAME_STATE.matchedPairs >= 8 && !GAME_STATE._levelCompleteFiring) {
          GAME_STATE._levelCompleteFiring = true;  // G-05 FIX
          levelComplete().finally(() => { GAME_STATE._levelCompleteFiring = false; });
        }
      }, Math.max(400, dur * 1000));
    } else {
      showToast("No unmatched pair to leap to!", "info");
    }
    return;
  }
  // ── The8 permanent card flag ──────────────────────────────────────
  const isPermanent = cardEl.dataset.permanent === 'true';
  // ── Mismatch flip-back pending ────────────────────────────────────
  if (GAME_STATE.runtime.mismatchAwaitingFlipBack) {
    if (GAME_STATE.firstPick === cardEl || GAME_STATE.secondPick === cardEl) return;
    if (cardEl.classList.contains('flipped') && !isPermanent) return;
    if (GAME_STATE.firstPick && !GAME_STATE.firstPick.dataset.permanent) GAME_STATE.firstPick.classList.remove('flipped');
    if (GAME_STATE.secondPick && !GAME_STATE.secondPick.dataset.permanent) GAME_STATE.secondPick.classList.remove('flipped');
    GAME_STATE.runtime.mismatchAwaitingFlipBack = false;
    GAME_STATE.lockExposure = false;
    resetPicks();
    if (!isPermanent) cardEl.classList.add('flipped');
    GAME_STATE.firstPick = cardEl;
    return;
  }
  if (GAME_STATE.lockExposure) return;
  if (cardEl.classList.contains('flipped') && !isPermanent) return;
  // ── Wonwoo System Hack armed ─────────────────────────────────────
  if (isWonwooHackActive()) {
    const dur = GAME_STATE.runtime.wonwooHighlightSec || 1;
    if (GAME_STATE.firstPick && !GAME_STATE.firstPick.classList.contains('matched') && !GAME_STATE.firstPick.dataset.permanent) GAME_STATE.firstPick.classList.remove('flipped');
    if (GAME_STATE.secondPick && !GAME_STATE.secondPick.classList.contains('matched') && !GAME_STATE.secondPick.dataset.permanent) GAME_STATE.secondPick.classList.remove('flipped');
    resetPicks();
    GAME_STATE.runtime.wonwooCharges -= 1;
    GAME_STATE.runtime.wonwooActiveReveals += 1;
    const allCards = getAllCardElements();
    const matchCard = allCards.find(c => c !== cardEl && c.dataset.matchKey === cardEl.dataset.matchKey && !c.classList.contains('matched') && !c.classList.contains('flipped'));
    if (matchCard) {
      matchCard.classList.add('flipped');
      setTimeout(() => {
        if (!matchCard.classList.contains('matched') && !matchCard.dataset.permanent) matchCard.classList.remove('flipped');
        GAME_STATE.runtime.wonwooActiveReveals = Math.max(0, GAME_STATE.runtime.wonwooActiveReveals - 1);
        if (GAME_STATE.runtime.wonwooCharges <= 0 && GAME_STATE.runtime.wonwooActiveReveals <= 0) {
          resumeTimerForWonwoo();
        }
      }, Math.max(160, dur * 1000));
    } else {
      GAME_STATE.runtime.wonwooActiveReveals = Math.max(0, GAME_STATE.runtime.wonwooActiveReveals - 1);
    }
    if (GAME_STATE.runtime.wonwooCharges <= 0) {
      GAME_STATE.runtime.wonwooArmed = false;
      if (GAME_STATE.runtime.wonwooActiveReveals <= 0) resumeTimerForWonwoo();
      showToast("System Hack used up", "info");
    } else {
      showToast(`System Hack: ${GAME_STATE.runtime.wonwooCharges} left`, "info");
    }
    return;
  }
  // ── Normal flip (up to 3 cards) ───────────────────────────────────
  if (!isPermanent) cardEl.classList.add('flipped');
  // Collect currently flipped non-matched cards (excluding permanent)
  const allFlipped = getAllCardElements().filter(c => c.classList.contains('flipped') && !c.classList.contains('matched') && !c.dataset.permanent);
  // If fewer than 2 flipped, just record first pick and wait
  if (allFlipped.length < 2) {
    GAME_STATE.firstPick = allFlipped[0] || null;
    GAME_STATE.secondPick = null;
    return;
  }
  // Check if any two of the flipped cards match
  const groups = {};
  allFlipped.forEach(c => {
    (groups[c.dataset.matchKey] ||= []).push(c);
  });
  let matchFound = false;
  for (const key of Object.keys(groups)) {
    if (groups[key].length >= 2) {
      const [c1, c2] = groups[key];
      c1.removeAttribute('data-permanent');
      c2.removeAttribute('data-permanent');
      c1.classList.add('matched', 'locked');
      c2.classList.add('matched', 'locked');
      GAME_STATE.matchedPairs += 1;
      resetPicks();
      document.getElementById('matchesCount').textContent = String(GAME_STATE.matchedPairs);
      GAME_STATE.stats.idolMatches[key] = (GAME_STATE.stats.idolMatches[key] || 0) + 1;
      if (key === 'kkuma') GAME_STATE.kkumaMatchedThisLevel = true;
      if (!isBattleRunActive()) updateTieredQuestsAfterMatch(key);
      matchFound = true;
      // Remove matched cards from the flipped pool
      break;
    }
  }
  if (matchFound) {
    resetPicks();
    setTimeout(async () => {
      if (GAME_STATE.matchedPairs >= 8 && !GAME_STATE._levelCompleteFiring) {
        GAME_STATE._levelCompleteFiring = true;
        try { await levelComplete(); } finally { GAME_STATE._levelCompleteFiring = false; }
      }
    }, 220);
    return;
  }
  // No match yet — if max 3 are flipped, flip them all back
  const stillFlipped = getAllCardElements().filter(c => c.classList.contains('flipped') && !c.classList.contains('matched') && !c.dataset.permanent);
  if (stillFlipped.length >= 3) {
    // Track for Dino History Maker
    const rt = GAME_STATE.runtime;
    // Store last mismatched pair for Dino History Maker
    GAME_STATE.runtime.lastMismatchedPair = {
      cards: [stillFlipped[0], stillFlipped[1]],
      matchKeys: [stillFlipped[0]?.dataset?.matchKey, stillFlipped[1]?.dataset?.matchKey]
    };
    rt.lastFailedCards = rt.lastFailedCards || [];
    stillFlipped.forEach(c => {
      if (c.dataset.cardId) rt.lastFailedCards.push(c.dataset.cardId);
    });
    if (rt.lastFailedCards.length > 6) rt.lastFailedCards = rt.lastFailedCards.slice(-6);
    GAME_STATE.lockExposure = true;
    GAME_STATE.runtime.mismatchAwaitingFlipBack = true;
    svtMissFx(stillFlipped);
    const flipBackMs = 300;
    setTimeout(() => {
      if (GAME_STATE.runtime.mismatchAwaitingFlipBack) {
        getAllCardElements().forEach(c => {
          if (c.classList.contains('flipped') && !c.classList.contains('matched') && !c.dataset.permanent) {
            c.classList.remove('flipped');
          }
        });
        resetPicks();
        GAME_STATE.runtime.mismatchAwaitingFlipBack = false;
        const dur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--flip-duration')) || 300;
        setTimeout(() => {
          GAME_STATE.lockExposure = false;
        }, dur);
      }
    }, flipBackMs);
  } else {
    // 2 flipped, no match — auto flip back after delay
    if (stillFlipped.length === 2) {
      const rt = GAME_STATE.runtime;
      rt.lastFailedCards = rt.lastFailedCards || [];
      stillFlipped.forEach(c => {
        if (c.dataset.cardId) rt.lastFailedCards.push(c.dataset.cardId);
      });
      if (rt.lastFailedCards.length > 6) rt.lastFailedCards = rt.lastFailedCards.slice(-6);
      // 🔽 ADD THIS BLOCK
      GAME_STATE.runtime.lastMismatchedPair = {
        cards: [stillFlipped[0], stillFlipped[1]],
        matchKeys: [stillFlipped[0].dataset.matchKey, stillFlipped[1].dataset.matchKey]
      };
      GAME_STATE.firstPick = stillFlipped[0];
      GAME_STATE.secondPick = stillFlipped[1];
      svtMissFx(stillFlipped);
      GAME_STATE.lockExposure = true;
      GAME_STATE.runtime.mismatchAwaitingFlipBack = true;
      setTimeout(() => {
        if (!GAME_STATE.runtime.mismatchAwaitingFlipBack) return;
        stillFlipped.forEach(c => {
          if (!c.classList.contains('matched') && !c.dataset.permanent) {
            c.classList.remove('flipped');
          }
        });
        resetPicks();
        GAME_STATE.runtime.mismatchAwaitingFlipBack = false;
        const dur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--flip-duration')) || 300;
        setTimeout(() => {
          GAME_STATE.lockExposure = false;
        }, dur);
      }, 700); // 700ms = player sees both cards before they flip back
    }
  }
}

function resetPicks() {
  GAME_STATE.firstPick = null;
  GAME_STATE.secondPick = null;
}
// Full-screen Daily Box Experience...
let __dailyBoxAttempts = 4;
let __dailyBoxPhase = "upgrade";
let __dailyBoxOpenDoubleTapCount = 0;
let __dailyBoxReturnDoubleTapCount = 0;
let __dailyBoxOpenUsed = false;  // G-01: prevent double-open
let __dailyBoxPreResolved = null; // PRE-RESOLVE FIX: holds {reward, finalStar, beforeCoins} when triggered from levelComplete
let __dailyBoxOnCloseCallback = null; // PATCH3 FIX: preserved onClose so "done" phase can call it after __dailyBoxPreResolved is nulled in "open" phase

function showDailyBackdrop() {
  const d = document.getElementById('dailyBackdrop');
  if (d) {
    d.classList.add('show');
    d.setAttribute('aria-hidden', 'false');
  }
}

function hideDailyBackdrop() {
  const d = document.getElementById('dailyBackdrop');
  if (d) {
    d.classList.remove('show');
    d.setAttribute('aria-hidden', 'true');
  }
}

function showDailyBoxFullscreen() {
  // G-03 FIX: always reset attempts/phase so mid-session reopens start fresh
  __dailyBoxAttempts = 4;
  __dailyBoxPhase = 'upgrade';
  // PRE-RESOLVE FIX: start animation at star 1 regardless of the pre-resolved final star.
  // The upgrade animation will cosmetically progress to the final star.
  const animStartStar = 1;
  GAME_STATE.daily.box.star = animStartStar;
  preloadImages(['./imgs/boxes/background.jpg', './imgs/boxes/1.jpg', './imgs/boxes/2.jpg', './imgs/boxes/3.jpg', './imgs/boxes/4.jpg', './imgs/boxes/5.jpg']);
  const fs = document.getElementById('dailyBoxFullscreen');
  const fsBg = document.getElementById('dailyBoxFsBg');
  const fsImg = document.getElementById('dailyBoxFsImg');
  const fsStars = document.getElementById('dailyBoxFsStars');
  const fsLabel = document.getElementById('dailyBoxFsAttemptsLabel');
  const hint = document.getElementById('dailyBoxFsTapHint');
  const resultCenter = document.getElementById('dailyResultCenter');
  ensureDailyResetIfNeeded();
  fsBg.style.backgroundImage = "url('./imgs/boxes/background.jpg')";
  fs.classList.add('show');
  fs.setAttribute('aria-hidden', 'false');
  resultCenter.classList.remove('show');
  showDailyBackdrop();
  __dailyBoxOpenDoubleTapCount = 0;
  __dailyBoxReturnDoubleTapCount = 0;
  __dailyBoxOpenUsed = false;  // G-01: reset on open
  let tapEnabled = false;
  const enableTapSoon = () => {
    tapEnabled = true;
  };

  function renderFsStars() {
    fsStars.innerHTML = '';
    const s = GAME_STATE.daily?.box?.star || 1;
    for (let i = 0; i < s; i++) {
      const ic = document.createElement('i');
      ic.className = 'fas fa-star';
      fsStars.appendChild(ic);
    }
  }
  renderFsStars();
  fsImg.src = boxImageForStar(GAME_STATE.daily?.box?.star || 1);
  updateDailyBoxFsProgress();
  fsLabel.textContent = `Attempts left: ${__dailyBoxAttempts}`;
  hint.textContent = "Tap! Tap!";
  tapEnabled = false;
  setTimeout(() => {
    fsImg.style.transform = 'scale(0.9)';
    fsImg.style.opacity = '0';
    requestAnimationFrame(() => {
      setTimeout(() => {
        fsImg.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        fsImg.style.transform = 'scale(1)';
        fsImg.style.opacity = '1';
        enableTapSoon();
      }, 50);
    });
  }, 400);
  const onClick = async () => {
    if (!tapEnabled) return;
    tapEnabled = false;                           // L99-FIX: debounce – block re-entry until animation completes
    setTimeout(() => { tapEnabled = true; }, 450); // L99-FIX: re-enable after flip anim (~400 ms)
    fs.classList.remove('shake');
    void fs.offsetWidth;
    fs.classList.add('shake');
    if (__dailyBoxPhase === "upgrade") {
      if (__dailyBoxAttempts <= 0) {
        __dailyBoxPhase = "open";
        updateDailyBoxFsProgress();
        hint.textContent = "Double-tap to open";
        return;
      }
      const prev = GAME_STATE.daily.box.star;
      if (__dailyBoxPreResolved) {
        // PRE-RESOLVE FIX: animate cosmetically toward the pre-decided final star.
        // Work out what the star "should" be at this attempt index (4 - __dailyBoxAttempts).
        // We just show upgrades proportionally so the final state matches.
        const attemptsDone = 4 - __dailyBoxAttempts; // 0-based
        const finalStar = __dailyBoxPreResolved.finalStar;
        // Distribute upgrades evenly: show upgrade on last N attempts needed
        const upgradesNeeded = finalStar - 1; // starts at 1
        const upgradesLeft = finalStar - prev;
        const attemptsLeft = __dailyBoxAttempts; // before decrement
        // Show an upgrade if we still need one and it's "time" (proportional)
        if (prev < finalStar && upgradesLeft > 0) {
          GAME_STATE.daily.box.star = Math.min(5, prev + 1);
          renderFsStars();
          flipImageOnceAndUpdate(fsImg, boxImageForStar(GAME_STATE.daily.box.star), 400);
          showToast(`Upgraded to ${GAME_STATE.daily.box.star}⭐`, 'success');
        } else if (prev >= finalStar && prev >= 5) {
          showToast('Max rarity reached!', 'success');
        } else {
          showToast('No upgrade', 'info');
        }
      } else {
        if (prev < 5) {
          const p = STAR_UPGRADE_PROB[prev] || 0;
          if (Math.random() < p) {
            GAME_STATE.daily.box.star = Math.min(5, prev + 1);
            renderFsStars();
            flipImageOnceAndUpdate(fsImg, boxImageForStar(GAME_STATE.daily.box.star), 400);
            showToast(`Upgraded to ${GAME_STATE.daily.box.star}⭐`, 'success');
          } else {
            showToast('No upgrade', 'info');
          }
        } else {
          showToast('Max rarity reached!', 'success');
        }
      }
      __dailyBoxAttempts -= 1;
      fsLabel.textContent = `Attempts left: ${__dailyBoxAttempts}`;
      updateDailyBoxFsProgress();
      if (__dailyBoxAttempts <= 0) {
        __dailyBoxPhase = "open";
        hint.textContent = "Double-tap to open";
      }
      return;
    }
    if (__dailyBoxPhase === "open") {
      if (__dailyBoxOpenUsed) return;  // G-01: one-shot guard
      __dailyBoxOpenUsed = true;
      let reward, gained, beforeCoins;
      if (__dailyBoxPreResolved) {
        // PRE-RESOLVE FIX: coins already applied & saved – just display the result
        reward = __dailyBoxPreResolved.reward;
        gained = reward.coins || 0;
        beforeCoins = __dailyBoxPreResolved.beforeCoins;
        // PATCH3 FIX: preserve onClose BEFORE nulling so the "done" phase can still call it
        __dailyBoxOnCloseCallback = __dailyBoxPreResolved.onClose || null;
        __dailyBoxPreResolved = null;
      } else {
        // Fallback path (opened manually from hub, not post-level)
        reward = resolveDailyBoxReward(GAME_STATE.daily.box.star);
        beforeCoins = GAME_STATE.coins;
        await applyDailyBoxReward(reward);
        gained = reward.coins || 0;
        markNextUnclaimedDailyWinCellClaimed();
        resetDailyBoxStarForNextClaim();
      }
      document.getElementById('dailyResultCenter').classList.add('show');
      document.getElementById('dailyResultCoinsGained').textContent = `+${Number(gained || 0).toLocaleString()}`;
      document.getElementById('dailyResultCoinsTotal').textContent = Number(GAME_STATE.coins || 0).toLocaleString();
      __dailyBoxPhase = "done";
      hint.textContent = "Tap to return";
      return;
    }
    if (__dailyBoxPhase === "done") {
      fs.removeEventListener('click', onClick, true);
      fs.classList.remove('show');
      fs.setAttribute('aria-hidden', 'true');
      resetDailyBoxFullscreenContent();
      hideDailyBackdrop();
      // PATCH3 FIX: read the callback saved during the "open" phase.
      // (__dailyBoxPreResolved was already nulled when the box was opened;
      //  __dailyBoxOnCloseCallback retains the Spotlight/Snakeventeen callback.)
      const _onClose = __dailyBoxOnCloseCallback || null;
      __dailyBoxOnCloseCallback = null; // always reset
      if (_onClose) {
        _onClose();
      } else {
        document.getElementById('levelCompleteOverlay').classList.add('show');
        document.getElementById('levelCompleteOverlay').setAttribute('aria-hidden', 'false');
      }
    }
  };
  fs.onclick = null;
  fs.addEventListener('click', onClick, {
    capture: true
  });
}

function updateDailyBoxFsProgress() {
  const prog = document.getElementById('dailyBoxFsProgress');
  if (!prog) return;
  const cells = [...prog.querySelectorAll('.cell')];
  const used = 4 - __dailyBoxAttempts;
  cells.forEach((c, idx) => {
    if (idx < used) c.classList.add('active');
    else c.classList.remove('active');
  });
}

async function openProfileModal(userId) {
  if (!userId) return;
  const isMe = userId === currentUser?.id;
  let p = {};
  if (isMe) {
    const marriedKeys = Object.keys(GAME_STATE.marriedIdols || {}).filter(k => GAME_STATE.marriedIdols[k]);
    p = {
      displayName: currentUser.displayName || currentUser.username,
      username: currentUser.username,
      avatarSrc: equippedAvatarSrc(),
      favIdol: IDOLS.find(i => i.key === GAME_STATE.equippedIdolKey)?.display || '—',
      marriedCount: marriedKeys.length,
      totalLoveLevel: marriedKeys.reduce((s, k) => s + (GAME_STATE.love[k]?.level || 1), 0),
      gamesPlayed: (GAME_STATE.level || 0) + (GAME_STATE.spotlightLevel || 0),
      totalCoinsEarned: GAME_STATE.stats.totalCoinsEarned || 0,
      bestStreak: GAME_STATE.stats.bestStreak || 0,
      bestSpotlightStreak: GAME_STATE.stats.spotlightBestStreak || 0,
      kkumaHits: GAME_STATE.stats.kkumaHits || 0,
      battleWins: (GAME_STATE.battles?.logs || []).filter(l => l.winner?.userId === currentUser.id).length,
      battleLosses: (GAME_STATE.battles?.logs || []).filter(l => !l.tie && l.loser?.userId === currentUser.id).length,  // F-05 FIX: exclude ties
      showtimeLevel: GAME_STATE.level ?? 0,
      spotlightLevel: GAME_STATE.spotlightLevel ?? 0,
      joinDate: currentUser.joinDate || '—',
      bgCss: equippedProfileBackgroundCss(),
      titleLabel: equippedProfileTitleLabel(),
      hasCustomTitle: !!(GAME_STATE.equippedProfileTitleKey && GAME_STATE.equippedProfileTitleKey !== 'default'),
    };
  } else {
    // 2. This 'await' now works because of the 'async' above
    const data = await getPlayerStateByUserId(userId);
    const u = data?.user || {};
    const ps = data?.playerState || {};
    const marriedKeys = Object.keys(ps.marriedIdols || {}).filter(k => ps.marriedIdols[k]);
    const equippedKey = ps.equippedIdolKey;
    p = {
      displayName: u.displayName || ps.displayName || u.username || 'Friend',
      username: u.username || ps.username || '',
      avatarSrc: equippedKey ? `./imgs/${equippedKey}/1.jpg` : './imgs/assets/default_avatar.png',
      favIdol: IDOLS.find(i => i.key === equippedKey)?.display || '—',
      marriedCount: marriedKeys.length,
      totalLoveLevel: marriedKeys.reduce((s, k) => s + ((ps.love || {})[k]?.level || 1), 0),
      gamesPlayed: (ps.level || 0) + (ps.spotlightLevel || 0),
      totalCoinsEarned: ps.stats?.totalCoinsEarned || 0,
      bestStreak: ps.stats?.bestStreak || 0,
      bestSpotlightStreak: ps.stats?.spotlightBestStreak || 0,
      kkumaHits: ps.stats?.kkumaHits ?? ps.kkumaHits ?? 0,
      battleWins: (ps.battles?.logs || []).filter(l => l.winner?.username === (u.username || ps.username)).length,
      battleLosses: (ps.battles?.logs || []).filter(l => !l.tie && l.loser?.username === (u.username || ps.username)).length,  // F-05 FIX: exclude ties
      showtimeLevel: ps.level ?? 0,
      spotlightLevel: ps.spotlightLevel ?? 0,
      joinDate: u.joinDate || '—',
      bgCss: (PROFILE_BACKGROUNDS.find(b => b.key === ps.equippedProfileBackgroundKey) || PROFILE_BACKGROUNDS[0]).css,
      titleLabel: (PROFILE_TITLES.find(t => t.key === ps.equippedProfileTitleKey) || PROFILE_TITLES[0]).label,
      hasCustomTitle: !!(ps.equippedProfileTitleKey && ps.equippedProfileTitleKey !== 'default'),
    };
  }
  const winRate = (p.battleWins + p.battleLosses > 0) ? Math.round((p.battleWins / (p.battleWins + p.battleLosses)) * 100) + '%' : '—';
  // 3. Fixed the quotes and backticks here
  const modalTitle = isMe ? 'My Profile' : `${escapeHtml(p.displayName)}'s Profile`;  // S-02: escape in title
  openModal(modalTitle, `
    <div style="max-height:70vh; overflow-y:auto; padding-right:4px;">

    <!-- Profile Hero: 1:1 square card — background + idol picture + name + title -->
    <div style="
      position:relative;width:100%;aspect-ratio:1/1;border-radius:24px;
      overflow:hidden;margin-bottom:14px;
      box-shadow:0 14px 34px rgba(0,0,0,0.18);
      background:${p.bgCss};
    ">
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(
        45deg,rgba(255,255,255,0.06) 0px,rgba(255,255,255,0.06) 8px,transparent 8px,transparent 20px
      );pointer-events:none;"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,0.55) 100%);"></div>

      <div style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:44%;aspect-ratio:1/1;">
        <img src="${p.avatarSrc}" alt="idol picture" style="
          width:100%;height:100%;border-radius:50%;
          border:4px solid rgba(255,255,255,0.95);
          box-shadow:0 12px 28px rgba(0,0,0,0.28);
          object-fit:cover;display:block;"/>
      </div>

      <div style="position:absolute;left:0;right:0;bottom:16px;text-align:center;padding:0 12px;">
        <div style="font-size:21px;font-weight:900;color:#ffffff;line-height:1.1;text-shadow:0 2px 8px rgba(0,0,0,0.45);">${escapeHtml(p.displayName)}</div>
        <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.85);margin-top:2px;text-shadow:0 1px 4px rgba(0,0,0,0.4);">@${escapeHtml(p.username)}</div>
        <div style="
          display:inline-flex;align-items:center;gap:5px;
          margin-top:8px;padding:4px 12px;border-radius:9999px;
          background:rgba(255,255,255,0.28);
          border:1px solid rgba(255,255,255,0.6);
          font-size:11px;font-weight:800;color:#ffffff;
          text-shadow:0 1px 3px rgba(0,0,0,0.35);
        ">${p.hasCustomTitle ? p.titleLabel : `Joined ${p.joinDate}`}</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <div class="glass-card" style="flex:1;border-radius:14px;padding:8px 10px;text-align:center;">
        <div style="font-size:18px;font-weight:900;color:#0f172a;">${p.gamesPlayed}</div>
        <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">GAMES PLAYED</div>
      </div>
      <div class="glass-card" style="flex:1;border-radius:14px;padding:8px 10px;text-align:center;">
        <div style="font-size:18px;font-weight:900;color:#0f172a;">${p.totalCoinsEarned.toLocaleString()}</div>
        <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">NET INCOME</div>
      </div>
      <div class="glass-card" style="flex:1;border-radius:14px;padding:8px 10px;text-align:center;">
        <div style="font-size:18px;font-weight:900;color:#0f172a;">${winRate}</div>
        <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">WIN RATE</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
      <div style="background:rgba(255,255,255,0.92);border-radius:16px;padding:12px 10px;text-align:center;border:1px solid rgba(255,255,255,0.8);box-shadow:0 4px 14px rgba(0,0,0,0.06);">
        <div style="font-size:24px;line-height:1;">💍</div>
        <div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:3px;">${p.marriedCount}</div>
        <div style="font-size:9px;color:#64748b;font-weight:800;margin-top:2px;">MARRIED IDOLS</div>
      </div>

      <div style="background:rgba(255,255,255,0.92);border-radius:16px;padding:12px 10px;text-align:center;border:1px solid rgba(255,255,255,0.8);box-shadow:0 4px 14px rgba(0,0,0,0.06);">
        <div style="font-size:24px;line-height:1;">💕</div>
        <div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:3px;">${p.totalLoveLevel}</div>
        <div style="font-size:9px;color:#64748b;font-weight:800;margin-top:2px;">TOTAL LOVE LVL</div>
      </div>

      <div style="background:rgba(255,255,255,0.92);border-radius:16px;padding:12px 10px;text-align:center;border:1px solid rgba(255,255,255,0.8);box-shadow:0 4px 14px rgba(0,0,0,0.06);">
        <div style="font-size:24px;line-height:1;">⚔️</div>
        <div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:3px;">${p.battleWins}</div>
        <div style="font-size:9px;color:#64748b;font-weight:800;margin-top:2px;">BATTLE WINS</div>
      </div>

      <div style="background:rgba(255,255,255,0.92);border-radius:16px;padding:12px 10px;text-align:center;border:1px solid rgba(255,255,255,0.8);box-shadow:0 4px 14px rgba(0,0,0,0.06);">
        <div style="font-size:24px;line-height:1;">😤</div>
        <div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:3px;">${p.battleLosses}</div>
        <div style="font-size:9px;color:#64748b;font-weight:800;margin-top:2px;">BATTLE LOSSES</div>
      </div>
    </div>

    </div>
  `);
}

function openMyProfileFromPanel() {
  closeSlidePanel();
  setTimeout(() => openProfileModal(currentUser?.id), 220);
}

function resetLevelCompleteOverlayHTML() {
  const overlay = document.getElementById('levelCompleteOverlay');
  const body = overlay.querySelector('.p-4.space-y-3');
  if (!body) return;
  body.innerHTML = `
    <div class="glass-card rounded-2xl p-4">
    <div class="flex items-center justify-between gap-3">
        <div>
        <p class="text-xs text-gray-500 font-bold">Time</p>
        <p class="text-lg font-black text-gray-900"><span id="lcTime">0.0</span>s</p>
        </div>
        <div class="text-right">
        <p class="text-xs text-gray-500 font-bold">Total</p>
        <p class="text-lg font-black text-gray-900">+<span id="lcTotal">0</span><img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></p>
        </div>
    </div>
    </div>
    <div class="earn-row" id="lcBaseRow">
    <div class="label">Base</div>
    <div class="val">+<span id="lcBase">100</span><img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    <div class="earn-row muted" id="lcStreakRow">
    <div class="label" id="lcStreakLabel"><img src="./imgs/assets/fire.png" style="width:1em;height:1em;vertical-align:middle;"> Bonus</div>
    <div class="val" id="lcStreakVal">+<span id="lcBonus">0</span><img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    <div class="earn-row muted hidden" id="lcKkumaRow">
    <div class="label">🐾 Kkuma Bonus</div>
    <div class="val">+5000<img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    <div class="earn-row muted hidden" id="lcIdolBonusRow">
    <div class="label">🎭 Idol Bonus</div>
    <div class="val">+<span id="lcIdolBonus">0</span><img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    <div class="earn-row muted" id="lcXpRow"><div class="label">Season XP</div><div class="val">+<span id="lcSeasonXp">0</span> XP</div></div>
    <div class="grid grid-cols-2 gap-3 pt-2">
    <button class="btn-theme-inline black-text" id="lcBackBtn" onclick="advanceLevelAndGoHubFromPopup()">Back to Hub</button>
    <button class="btn-theme-inline black-text" id="lcNextBtn" onclick="nextLevelFromPopup()">Next Level</button>
    </div>
  `;
}

function openBattleResultOverlay(timeSec) {
  // Reset the overlay content to its empty template
  resetLevelCompleteOverlayHTML();
  const titleEl = document.getElementById('lcHeaderTitle');
  if (titleEl) titleEl.textContent = 'Battle Completed!';
  const overlay = document.getElementById('levelCompleteOverlay');
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  // Show only the time value
  const timeEl = document.getElementById('lcTime');
  if (timeEl) timeEl.textContent = Number(timeSec).toFixed(2);
  // Hide the total coin row completely
  const totalParent = document.getElementById('lcTotal')?.parentElement?.parentElement;
  if (totalParent) totalParent.style.display = 'none';
  // Hide all earn‑rows
  ['lcBaseRow', 'lcStreakRow', 'lcKkumaRow', 'lcIdolBonusRow', 'lcXpRow'].forEach(id => {
    const row = document.getElementById(id);
    if (row) row.classList.add('hidden');
  });
  // Hide "Next Level" button
  const nextBtn = document.getElementById('lcNextBtn');
  if (nextBtn) nextBtn.classList.add('hidden');
  // Repurpose "Back to Hub" button (make it full width and rename)
  const backBtn = document.getElementById('lcBackBtn');
  if (backBtn) {
    backBtn.textContent = 'Back to Hub';
    backBtn.onclick = () => {
      closeLevelCompleteOverlay();
      showScreen('hubScreen');
    };
    backBtn.classList.remove('hidden');
    backBtn.style.width = '100%';
    const container = backBtn.parentNode;
    if (container) {
      container.classList.remove('grid-cols-2', 'gap-3');
      container.classList.add('w-full');
    }
  }
  // Optionally adjust the title (the overlay already says "Battle Completed!")
  // but you can change it to whatever you like by editing the HTML inside
  // the overlay – the standard title is in the static HTML. It's fine.
}

function openLevelCompleteOverlay({
  timeSec,
  baseReward,
  streakBonus,
  abilityBonus,
  streakLostText,
  kkumaBonus = 0,
  idolBonus = 0,
  seasonXpGained = Number(GAME_STATE.meta?.lastRunXpGained) || 0,
  isBattleResult = false
}) {
  resetLevelCompleteOverlayHTML();
  // Change the title according to success / failure
  const passed = (typeof passedLevel !== 'undefined' && passedLevel !== null) ? !!passedLevel : true;  // U-05 FIX: explicit bool cast
  const titleEl = document.getElementById('lcHeaderTitle');
  if (titleEl) {
    titleEl.textContent = passed ? 'Level Complete!' : 'Level Failed';
  }
  const overlay = document.getElementById('levelCompleteOverlay');
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  const timeEl = document.getElementById('lcTime');
  if (timeEl) {
    const t = timeSec || 0;
    timeEl.textContent = t < 1 ? t.toFixed(3) : t.toFixed(2);
  }
  const baseRow = document.getElementById('lcBaseRow');
  const streakRow = document.getElementById('lcStreakRow');
  const abilityRow = document.getElementById('lcAbilityRow');
  const kkumaRow = document.getElementById('lcKkumaRow');
  const xpRow = document.getElementById('lcXpRow');
  const xpVal = document.getElementById('lcSeasonXp');
  const nextBtn = document.getElementById('lcNextBtn');
  const backBtn = document.getElementById('lcBackBtn');
  if (isBattleResult) {
    // Hide earn rows
    ['lcBaseRow', 'lcStreakRow', 'lcKkumaRow', 'lcIdolBonusRow', 'lcXpRow'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    // Hide the Total line (coin + amount)
    const totalParent = document.getElementById('lcTotal')?.parentElement?.parentElement; // flex container
    if (totalParent) {
      const rightDiv = totalParent.querySelector('.text-right');
      if (rightDiv) rightDiv.style.display = 'none';
    }
    document.getElementById('lcTime').textContent = (timeSec || 0).toFixed(2);
    const nextBtn = document.getElementById('lcNextBtn');
    const backBtn = document.getElementById('lcBackBtn');
    if (nextBtn) nextBtn.classList.add('hidden');
    if (backBtn) {
      backBtn.textContent = 'Back to Hub';
      // Make back button full width
      backBtn.classList.add('w-full');
      const btnContainer = backBtn.parentNode;
      if (btnContainer) {
        btnContainer.classList.remove('grid-cols-2', 'gap-3');
        btnContainer.classList.add('w-full');
      }
    }
    return;
  }
  // --- Standard Level Complete Logic ---
  if (xpRow) xpRow.classList.remove('hidden');
  if (xpVal) xpVal.textContent = Number(seasonXpGained || 0).toLocaleString();
  if (baseRow) baseRow.classList.remove('hidden');
  if (nextBtn) nextBtn.classList.remove('hidden');
  if (backBtn) {
    backBtn.classList.remove('hidden');
    backBtn.textContent = 'Back to Hub';
    backBtn.onclick = () => advanceLevelAndGoHubFromPopup();
  }
  const baseEl = document.getElementById('lcBase');
  if (baseEl) baseEl.textContent = Number(baseReward || 0).toLocaleString();
  // Streak Logic
  if (streakRow) {
    streakRow.classList.remove('hidden');
    const streakLabel = document.getElementById('lcStreakLabel');
    const streakVal = document.getElementById('lcStreakVal');
    if (streakLostText) {
      if (streakLabel) streakLabel.innerHTML = `<img src="./imgs/assets/fire.png" style="width:1em;height:1em;vertical-align:middle;"> ${streakLostText}`;
      if (streakVal) streakVal.textContent = '';
    } else {
      // Show streak multiplier like Spotlight
      const currentStreak = GAME_STATE.streak || 1;
      if (streakLabel) streakLabel.innerHTML = `<img src="./imgs/assets/fire.png" style="width:1em;height:1em;vertical-align:middle;"> Streak (${currentStreak}x)`;
      if (streakVal) streakVal.innerHTML = `+<span id="lcBonus">${Number(streakBonus || 0).toLocaleString()}</span> <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">`;
    }
  }
  // Kkuma Logic
  if (kkumaRow) {
    if (kkumaBonus > 0) {
      kkumaRow.classList.remove('hidden');
      const valDiv = kkumaRow.querySelector('.val');
      if (valDiv) valDiv.innerHTML = `+${Number(kkumaBonus).toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">`;
    } else {
      kkumaRow.classList.add('hidden');
    }
  }
  // Idol bonus row
  const idolBonusRow = document.getElementById('lcIdolBonusRow');
  const idolBonusVal = document.getElementById('lcIdolBonus');
  if (idolBonusRow && idolBonusVal) {
    if ((idolBonus || 0) > 0) {
      idolBonusRow.classList.remove('hidden');
      idolBonusVal.textContent = Number(idolBonus).toLocaleString();
    } else {
      idolBonusRow.classList.add('hidden');
    }
  }
  // If the player did NOT pass the level, hide the "Next" button and expand "Back to Hub"
  if (!passed) {
    if (nextBtn) nextBtn.classList.add('hidden');
    if (backBtn) {
      backBtn.textContent = 'Back to Hub';
      backBtn.style.width = '100%';
      const container = backBtn.parentNode;
      if (container) {
        container.classList.remove('grid-cols-2', 'gap-3');
        container.classList.add('w-full');
      }
    }
  }
  // Total Math
  const total = baseReward + (streakBonus || 0) + (abilityBonus || 0) + (idolBonus || 0) + (kkumaBonus || 0);
  const totalEl = document.getElementById('lcTotal');
  if (totalEl) {
    totalEl.textContent = Number(total).toLocaleString();
  }
  if (nextBtn) nextBtn.onclick = () => nextLevelFromPopup();
}

function isDailyBoxReady() {
  ensureDailyResetIfNeeded();
  const d = GAME_STATE.daily || {};
  d.claimedCells ||= [false, false, false, false, false, false]; // L99
  const wins = d.wins || 0;
  const claimables = Math.min(6, wins); // L99: 6 boxes
  const claimedCount = d.claimedCells.filter(Boolean).length;
  return claimedCount < claimables;
}

function nextUnclaimedWinCellIndex() {
  ensureDailyResetIfNeeded();
  const d = GAME_STATE.daily;
  d.claimedCells ||= [false, false, false, false, false, false]; // L99
  const wins = d.wins || 0;
  for (let i = 0; i < 6; i++) { // L99: 6 boxes
    if (i < wins && !d.claimedCells[i]) return i;
  }
  return -1;
}

function markNextUnclaimedDailyWinCellClaimed() {
  ensureDailyResetIfNeeded();
  GAME_STATE.daily.claimedCells ||= [false, false, false, false, false, false]; // L99
  const idx = nextUnclaimedWinCellIndex();
  if (idx >= 0) {
    GAME_STATE.daily.claimedCells[idx] = true;
  }
  updateDailyWinsUI();
  updateDailySixBoxesUI(); // L99
  savePlayerState();
}

function resetDailyBoxStarForNextClaim() {
  GAME_STATE.daily.box = {
    claimed: false,
    opened: false,
    star: 1
  };
  __dailyBoxAttempts = 4;
  __dailyBoxPhase = "upgrade";
  savePlayerState();
}

async function levelComplete() {
  if (GAME_STATE.levelJustFinished) return;
  stopTimer();
  const timeSec = GAME_STATE.lastLevelTimeSec ?? 9999;
  if (isBattleRunActive()) {
    // Process the battle result only (no coins, no streak, no quests)
    await onBattleRunFinished(timeSec);
    await finalizeFriendReplyBattleIfNeeded(timeSec);
    // Show simplified overlay – only time + Back to Hub
    openBattleResultOverlay(timeSec);
    GAME_STATE.pendingNextLevel = false;
    GAME_STATE.battles.active = null;
    GAME_STATE.levelAbilities = {
      offered: [],
      selected: []
    };
    renderHub();
    await savePlayerState();
    return;
  }
  GAME_STATE.levelJustFinished = true;
  let shouldTriggerDailyBox = false;
  if (!isBattleRunActive()) {
    ensureDailyResetIfNeeded();
    // L99: grant a daily box for completing a Showtime level (any time)
    {
      const beforeWins = GAME_STATE.daily.wins || 0;
      if (beforeWins < 6) { // L99: max 6 per day
        GAME_STATE.daily.wins = beforeWins + 1;
        if (isDailyBoxReady()) {
          shouldTriggerDailyBox = true;
        }
      }
    }
  }
  // Level, coins and run counters are awarded by the server (api/_lib/awards.js).
  const before = GAME_STATE.coins;
  const kkumaFlag = !!GAME_STATE.kkumaMatchedThisLevel && !isBattleRunActive();
  const award = await claimAwardSafe('showtime', {
    timeSec,
    pairs: { ...(GAME_STATE.currentLevelPairs || {}) },
    kkuma: kkumaFlag,
    fandomPct: svtFandomPct(),
    leadBonus: svtLeadBonus()
  });
  const awardExtra = (award && award.extra) || {};
  GAME_STATE.pendingNextLevel = !!awardExtra.passed;
  if (GAME_STATE.stats.bestTimeSec == null || timeSec < GAME_STATE.stats.bestTimeSec) {
    GAME_STATE.stats.bestTimeSec = timeSec;
  }
  updateTimedQuestsAfterLevel(timeSec);
  const prevStreak = GAME_STATE.streak || 0;
  // STREAK MAINTAINED ONLY IF time < 20 seconds (strict)
  const within20Strict = timeSec < 20;
  let streakLostText = null;
  if (within20Strict) {
    GAME_STATE.streak = prevStreak + 1;
    if ((GAME_STATE.stats.bestStreak || 0) < GAME_STATE.streak) {
      GAME_STATE.stats.bestStreak = GAME_STATE.streak;
    }
  } else {
    if (prevStreak > 0) streakLostText = `Streak lost! (${prevStreak} → 0)`;
    GAME_STATE.streak = 0;
  }
  // Bonuses shown on the result screen come from the server's calculation
  const streakBonus = Number(awardExtra.streakBonus) || 0;
  let abilityBonus = 0;
  if (kkumaFlag) {
    GAME_STATE.stats.kkumaHits = (GAME_STATE.stats.kkumaHits || 0) + 1;
  }
  const kkumaBonus = Number(awardExtra.kkumaBonus) || 0;
  const idolBonus = Number(awardExtra.idolBonus) || 0;
  const baseReward = Number(awardExtra.base) || 0;
  const totalReward = Number(awardExtra.runCoins) || 0;
  let seasonXpGained = 0;
  try { seasonXpGained = Number(Meta.onRunComplete('showtime', { passed: !!awardExtra.passed, elite: within20Strict, coins: totalReward, fandomCoins: Number(awardExtra.fandomCoins) || 0, keys: Object.keys(GAME_STATE.currentLevelPairs || {}) })) || 0; } catch (e) { console.warn('[Meta]', e); }
  renderHub();
  await savePlayerState();
  animateNumber(document.getElementById('hubCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('gameCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('questsCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('idolsCoins'), before, GAME_STATE.coins);
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) animateNumber(shopCoins, before, GAME_STATE.coins);
  const passedLevel = !!awardExtra.passed;
  if (passedLevel) fireLevelSuccessBurst();
  openLevelCompleteOverlay({
    timeSec,
    baseReward,
    streakBonus,
    abilityBonus,
    streakLostText,
    kkumaBonus,
    idolBonus,
    seasonXpGained,
    isBattleResult: false
  });
  GAME_STATE.levelAbilities = {
    offered: [],
    selected: []
  };
  updateDailyWinsUI();

  const _srvBox = (shouldTriggerDailyBox && isDailyBoxReady()) ? await svtOpenDailyBoxServer('daily') : null;
  if (_srvBox) {
    // ── DAILY BOX PRE-RESOLVE FIX ──────────────────────────────────────────
    // Decide the entire daily box outcome (star upgrades + reward) RIGHT NOW,
    // before any popup is shown. Coins are added and persisted immediately so
    // a page reload never loses them. The fullscreen animation is purely cosmetic.

    // 1) The server rolled the star upgrades and already paid the coins
    const previewStar = _srvBox.star;
    GAME_STATE.daily.box.star = previewStar;

    // 2) Reward for that star
    const preResolvedReward = _srvBox.reward;

    // 3) Mark the cell claimed NOW (before any animation)
    const boxBeforeCoins = _srvBox.beforeCoins;
    markNextUnclaimedDailyWinCellClaimed();
    resetDailyBoxStarForNextClaim();
    // Force the final star into the box state so the fullscreen renders it correctly
    GAME_STATE.daily.box.star = previewStar;
    renderHub();
    updateDailyWinsUI();

    // 4) Persist BEFORE showing any UI – reload-safe from this point on
    await savePlayerState();

    // 5) Now show the cosmetic animation. Pass pre-resolved values so the
    //    fullscreen never calls applyDailyBoxReward again.
    setTimeout(() => {
      closeLevelCompleteOverlay();
      __dailyBoxAttempts = 4;
      __dailyBoxPhase = "upgrade";
      __dailyBoxPreResolved = {
        reward: preResolvedReward,
        finalStar: previewStar,
        beforeCoins: boxBeforeCoins
      };
      showDailyBoxFullscreen();
    }, 300);
  } else {
    await savePlayerState();
  }
}

async function nextLevel() {
  await maybeApplyPendingLevelUp();
  await savePlayerState();
  startLevel();
}

function confirmExitGame() {
  if (!GAME_STATE.inLevel) {
    showScreen('hubScreen');
    return;
  }
  if (GAME_STATE.levelJustFinished) {
    showToast("Choose Back to Hub or Next Level", "info");
    return;
  }
  openUndismissibleModal("Exit Level?", `
    <div class="glass-card rounded-2xl p-4 space-y-2">
      <p class="text-sm text-gray-700 font-semibold">
        If you exit now:
      </p>
      <ul class="text-xs text-gray-600 font-bold list-disc pl-5 space-y-1">
        <li>Your current streak will be lost.</li>
        <li>This level will not count towards quests.</li>
        <li>You will not earn any coins for this run.</li>
      </ul>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-2">
      <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Continue Playing</button>
      <button class="btn-confirm-no" onclick="exitGameConfirmed()">Exit Anyway</button>
    </div>
  `);
}

function exitGameConfirmed() {
  closeModal();
  stopTimer();
  GAME_STATE.inLevel = false;
  GAME_STATE.pendingNextLevel = false; // P-05 FIX: never advance level on forced exit
  PENDING_DECK = null;
  if (GAME_STATE.runtime.hoshiNextTryTimer) clearTimeout(GAME_STATE.runtime.hoshiNextTryTimer);
  if (!isBattleRunActive()) {
    GAME_STATE.streak = 0;
    document.getElementById('showtimeStreakCount').textContent = '0';
  }
  if (isBattleRunActive()) {
    GAME_STATE.battles.active = null;
  }
  GAME_STATE.levelAbilities = {
    offered: [],
    selected: []
  };
  // ✅ Save the streak reset to the database / local storage
  __blockSavesUntil = 0; // allow saves now
  savePlayerState(); // persist the streak = 0
  showScreen('hubScreen');
}

function startTimer() {
  stopTimer();
  GAME_STATE.startTime = performance.now();
  GAME_STATE.runtime.offsetSec = 0;
  GAME_STATE.runtime.pausedAccumSec = 0;
  GAME_STATE.runtime.pauseStartMs = 0;
  GAME_STATE.runtime.frozenUntilAtDisplay = null;
  const timerEl = document.getElementById('gameTimer');
  GAME_STATE.timerId = setInterval(() => {
    const t = getDisplayedTimeSec();
    timerEl.textContent = t < 1 ? t.toFixed(3) : t.toFixed(2);
  }, 100);
}

function stopTimer() {
  if (GAME_STATE.timerId) clearInterval(GAME_STATE.timerId);
  GAME_STATE.timerId = null;
  if (GAME_STATE.startTime != null) {
    GAME_STATE.lastLevelTimeSec = getDisplayedTimeSec();
  }
  // Reset startTime to allow re-starting timer on next action in the same level
  GAME_STATE.startTime = null;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function oddsTotal(odds) {
  return Object.values(odds).reduce((a, b) => a + Number(b || 0), 0);
}

function weightedPickRarity() {
  const entries = Object.entries(RARITY_ODDS);
  const total = oddsTotal(RARITY_ODDS);
  let r = Math.random() * total;
  for (const [rarity, weight] of entries) {
    r -= weight;
    if (r <= 0) return rarity;
  }
  return "rare";
}

function pickIdolsForLevel(count) {
  const picked = new Set();
  const byRarity = {
    kkuma: [],
    legendary: [],
    mythic: [],
    epic: [],
    superrare: [],
    rare: []
  };
  for (const idol of IDOLS) {
    const rar = IDOL_RARITY[idol.key] || "rare";
    (byRarity[rar] ||= []).push(idol);
  }
  const all = [...IDOLS];
  let safety = 0;
  while (picked.size < count && safety++ < 5000) {
    const rar = weightedPickRarity();
    const bucket = (byRarity[rar] || []).filter(i => !picked.has(i.key));
    if (bucket.length > 0) {
      const idol = bucket[Math.floor(Math.random() * bucket.length)];
      picked.add(idol.key);
    } else {
      const remaining = all.filter(i => !picked.has(i.key));
      if (!remaining.length) break;
      const idol = remaining[Math.floor(Math.random() * remaining.length)];
      picked.add(idol.key);
    }
  }
  const result = [...picked].map(k => IDOLS.find(i => i.key === k));
  // 0.1% chance to replace one idol with Kkuma (not in battles)
  if (!isBattleRunActive() && Math.random() < 0.001) {
    const ri = Math.floor(Math.random() * result.length);
    result[ri] = {
      key: 'kkuma',
      display: 'Kkuma'
    };
  }
  return result;
}

function pickTwoDistinctImages(idolKey) {
  const raw = IDOL_IMAGES[idolKey] || [];
  // Exclude 1.jpg — reserved for idol cards/avatars only
  const list = raw.filter(f => f !== '1.jpg');
  if (list.length < 2) {
    // Fallback: use full list if filtered set is too small
    // G-03 FIX: if only one image exists, reuse it rather than crashing
    if (raw.length === 0) throw new Error(`No images at all for ${idolKey}.`);
    if (raw.length === 1) return [raw[0], raw[0]];  // duplicate as last resort
    const fallback = raw;
    const a = Math.floor(Math.random() * fallback.length);
    let b = Math.floor(Math.random() * fallback.length);
    while (b === a) b = Math.floor(Math.random() * fallback.length);
    return [fallback[a], fallback[b]];
  }
  const a = Math.floor(Math.random() * list.length);
  let b = Math.floor(Math.random() * list.length);
  while (b === a) b = Math.floor(Math.random() * list.length);
  return [list[a], list[b]];
}