function buildSpotlightRevealSchedule(targetKey, gridCards, targetGridIdx, isKkuma) {
  // Pre‑generate every reveal that will happen during the 20‑second game.
  // Each entry: { timeSec: number, cardIdx: number, idolKey: string, display: string, src: string, rarity: string, isTarget: boolean, showDuration: number }
  const schedule = [];
  const totalDuration = 20; // seconds
  const gapMin = 0.2,
    gapMax = 0.5; // seconds between reveals
  const showDurationMin = 0.6,
    showDurationMax = 0.9; // seconds a card stays visible
  const targetChanceBefore10s = 0.40;
  const targetChanceAfter10s = 0.20;
  let currentTime = 0.6; // first reveal after 0.6s
  while (currentTime <= totalDuration) {
    const chance = currentTime < 10 ? targetChanceBefore10s : targetChanceAfter10s;
    const showTarget = Math.random() < chance;
    let cardIdx;
    if (showTarget) {
      cardIdx = targetGridIdx;
    } else {
      // pick a random card that is not the target
      do {
        cardIdx = Math.floor(Math.random() * 16);
      } while (cardIdx === targetGridIdx);
    }
    const card = gridCards[cardIdx];
    // pick a random image from that idol's set (excluding 1.jpg)
    const imgs = IDOL_IMAGES[card.key] || ['1.jpg'];
    const pool = imgs.filter(f => f !== '1.jpg');
    const imgFile = pool.length ? pool[Math.floor(Math.random() * pool.length)] : imgs[0];
    const src = `./imgs/${card.key}/${imgFile}`;
    const showDuration = showDurationMin + Math.random() * (showDurationMax - showDurationMin);
    schedule.push({
      timeSec: currentTime,
      cardIdx,
      idolKey: card.key,
      display: card.display,
      src,
      rarity: card.rarity,
      isTarget: card.key === targetKey || card.isTarget,
      showDuration,
    });
    // next reveal starts after this one's duration + a random gap
    const gap = gapMin + Math.random() * (gapMax - gapMin);
    currentTime += showDuration + gap;
  }
  return schedule;
}

function buildSpotlightBattleSpec() {
  const isKkuma = Math.random() < 0.001;
  let tKey, tDisplay, tRarity;
  if (isKkuma) {
    tKey = 'kkuma';
    tDisplay = 'Kkuma';
    tRarity = 'kkuma';
  } else {
    const idol = IDOLS[Math.floor(Math.random() * IDOLS.length)];
    tKey = idol.key;
    tDisplay = idol.display;
    tRarity = IDOL_RARITY[tKey] || 'rare';
  }
  // Build grid cards (16) just like _buildSpotlightGrid
  const pool = IDOLS.map(i => i.key).filter(k => k !== tKey);
  shuffle(pool);
  const others = pool.slice(0, 15);
  const tPos = Math.floor(Math.random() * 16);
  const cards = [];
  let oi = 0;
  for (let i = 0; i < 16; i++) {
    if (i === tPos) {
      const imgs = isKkuma ? (IDOL_IMAGES.kkuma || ['1.jpg']) : (IDOL_IMAGES[tKey] || ['1.jpg']);
      const f = imgs[Math.floor(Math.random() * imgs.length)];
      cards.push({
        key: tKey,
        display: isKkuma ? 'Kkuma' : tDisplay,
        src: (isKkuma ? './imgs/kkuma/' : './imgs/' + tKey + '/') + f,
        rarity: tRarity,
        isTarget: true,
        isKkuma
      });
    } else {
      const k = others[oi++ % others.length];
      const idol = IDOLS.find(x => x.key === k);
      const imgs = IDOL_IMAGES[k] || ['1.jpg'];
      const f = imgs[Math.floor(Math.random() * imgs.length)];
      cards.push({
        key: k,
        display: idol?.display || k,
        src: './imgs/' + k + '/' + f,
        rarity: IDOL_RARITY[k] || 'rare',
        isTarget: false,
        isKkuma: false
      });
    }
  }
  return {
    targetKey: tKey,
    targetDisplay: tDisplay,
    targetRarity: tRarity,
    isKkuma,
    gridCards: cards,
    targetGridIdx: tPos,
    revealSchedule: buildSpotlightRevealSchedule(tKey, cards, tPos, isKkuma),
  };
}

function buildSnakeBattleSpec() {
  const chosenIdols = pickIdolsForLevel(1);
  const headIdol = chosenIdols[0];
  // Pre‑generate a sequence of food idols that will appear every few seconds
  const FOOD_INTERVAL = 5; // seconds
  const foodSchedule = [];
  const gameDuration = 30; // total seconds
  for (let t = FOOD_INTERVAL; t < gameDuration; t += FOOD_INTERVAL) {
    const foodIdol = pickIdolsForLevel(1)[0];
    foodSchedule.push({
      appearAtSec: t,
      idolKey: foodIdol.key,
      imgSrc: `./imgs/${foodIdol.key}/1.jpg`
    });
  }
  return {
    headIdolKey: headIdol.key,
    foodSchedule, // ← add this
  };
}


// ═══════════════════════════════════════════════
const SPOTLIGHT_STATE = {
  targetKey: null,
  targetDisplay: null,
  targetImgSrc: null,
  targetRarity: null,
  isKkuma: false,
  targetGridIdx: -1,
  gridCards: [],
  revealSequence: [],
  revealIdx: 0,
  correctHits: 0,
  wrongHits: 0,
  netCoins: 0,
  gameTimerId: null,
  revealTimerId: null,
  timeLeft: 20,
  phase: 'idle',
  clickedThisReveal: false,
};
// ── SPOTLIGHT IMAGE PRELOADER ──────────────────────────────────
let _slImagesPreloaded = false;

function preloadSpotlightImages() {
  if (_slImagesPreloaded) return;
  _slImagesPreloaded = true;
  const urls = [];
  Object.keys(IDOL_IMAGES).forEach(key => (IDOL_IMAGES[key] || []).forEach(f => urls.push(`./imgs/${key}/${f}`)));
  lowPriorityPreload(urls);
}

function preloadImages(urls) {
  urls.forEach(src => {
    const img = new Image();
    img.src = src;
  });
}

function openSpotlight(battleSpec) {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  preloadSpotlightImages();
  const useSpec = battleSpec || null;
  const isKkuma = useSpec ? useSpec.isKkuma : (Math.random() < 0.001);
  let tKey, tDisplay, tImgSrc, tRarity;
  if (useSpec) {
    tKey = useSpec.targetKey;
    tDisplay = useSpec.targetDisplay;
    tRarity = useSpec.targetRarity;
    const imgs = IDOL_IMAGES[tKey] || ['1.jpg'];
    tImgSrc = './imgs/' + tKey + '/' + imgs[Math.floor(Math.random() * imgs.length)];
    // will override grid cards later
  } else if (isKkuma) {
    tKey = 'kkuma';
    tDisplay = 'Kkuma';
    tRarity = 'kkuma';
    const imgs = IDOL_IMAGES.kkuma || ['1.jpg'];
    tImgSrc = './imgs/kkuma/' + imgs[Math.floor(Math.random() * imgs.length)];
  } else {
    const idol = IDOLS[Math.floor(Math.random() * IDOLS.length)];
    tKey = idol.key;
    tDisplay = idol.display;
    tRarity = IDOL_RARITY[tKey] || 'rare';
    const imgs = IDOL_IMAGES[tKey] || ['1.jpg'];
    tImgSrc = './imgs/' + tKey + '/' + imgs[Math.floor(Math.random() * imgs.length)];
  }
  Object.assign(SPOTLIGHT_STATE, {
    targetKey: tKey,
    targetDisplay: tDisplay,
    targetImgSrc: tImgSrc,
    targetRarity: tRarity,
    isKkuma,
    correctHits: 0,
    wrongHits: 0,
    earnedCoins: 0,
    lostCoins: 0,
    revealIdx: 0,
    phase: 'singleReveal',
    clickedThisReveal: false,
    gameTimerId: null,
    revealTimerId: null,
  });
  if (useSpec) {
    SPOTLIGHT_STATE.gridCards = useSpec.gridCards;
    SPOTLIGHT_STATE.targetGridIdx = useSpec.targetGridIdx;
  } else {
    _buildSpotlightGrid(tKey, tRarity, isKkuma);
  }
  _renderSlGrid();
  showScreen('spotlightScreen');
  _slShowPhase('singleReveal');
  document.getElementById('slCardFrontImg').src = tImgSrc;
  document.getElementById('slCardFrontName').textContent = tDisplay;
  document.getElementById('slSingleCardInner').style.transform = 'rotateY(0deg)';
  const front = document.getElementById('slCardFront');
  front.style.borderColor = rarityDotColor(tRarity);
  if (isKkuma) front.style.animation = 'kkumaBorder 2.4s linear infinite';
  else front.style.animation = '';
}

function _buildSpotlightGrid(tKey, tRarity, isKkuma) {
  const pool = IDOLS.map(i => i.key).filter(k => k !== tKey);
  shuffle(pool);
  const others = pool.slice(0, 15);
  const tPos = Math.floor(Math.random() * 16);
  SPOTLIGHT_STATE.targetGridIdx = tPos;
  const cards = [];
  let oi = 0;
  for (let i = 0; i < 16; i++) {
    if (i === tPos) {
      const imgs = isKkuma ? (IDOL_IMAGES.kkuma || ['1.jpg']) : (IDOL_IMAGES[tKey] || ['1.jpg']);
      const f = imgs[Math.floor(Math.random() * imgs.length)];
      cards.push({
        key: tKey,
        display: isKkuma ? 'Kkuma' : (IDOLS.find(x => x.key === tKey)?.display || tKey),
        src: (isKkuma ? './imgs/kkuma/' : './imgs/' + tKey + '/') + f,
        rarity: tRarity,
        isTarget: true,
        isKkuma
      });
    } else {
      const k = others[oi++ % others.length];
      const idol = IDOLS.find(x => x.key === k);
      const imgs = IDOL_IMAGES[k] || ['1.jpg'];
      const f = imgs[Math.floor(Math.random() * imgs.length)];
      cards.push({
        key: k,
        display: idol?.display || k,
        src: './imgs/' + k + '/' + f,
        rarity: IDOL_RARITY[k] || 'rare',
        isTarget: false,
        isKkuma: false
      });
    }
  }
  SPOTLIGHT_STATE.gridCards = cards;
  _renderSlGrid();
  _buildSlRevealSeq();
}

function _renderSlGrid() {
  const grid = document.getElementById('slGrid');
  grid.innerHTML = '';
  SPOTLIGHT_STATE.gridCards.forEach((c, idx) => {
    const el = document.createElement('button');
    el.className = 'sl-card' + (c.isKkuma ? ' sl-kkuma' : '');
    el.innerHTML = `
      <div class="sl-card-back">
        <div style="width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:white;">17</div>
      </div>
      <div class="sl-card-front" style="border:4px solid ${rarityDotColor(c.rarity)}; border-radius:10px;">
        <img src="${c.src}" alt="${c.display}" />
        <div class="sl-name">${c.display}</div>
    `;
    el.addEventListener('click', () => _onSlCardClick(el, c));
    grid.appendChild(el);
  });
}

function _buildSlRevealSeq() {
  // Reveals are driven by the self-scheduling _scheduleSlReveal loop.
  SPOTLIGHT_STATE.revealSequence = [];
}

function _slShowPhase(phase) {
  SPOTLIGHT_STATE.phase = phase;
  const cd = document.getElementById('slCountdown');
  const rv = document.getElementById('slRevealPhase');
  const gp = document.getElementById('slGridPhase');
  [cd, rv, gp].forEach(el => {
    if (el) el.style.display = 'none';
  });
  if (phase === 'countdown' && cd) {
    cd.style.display = 'flex';
  }
  if (phase === 'singleReveal' && rv) {
    rv.style.display = 'flex';
    rv.style.flexDirection = 'column';
  }
  if (phase === 'grid' && gp) {
    gp.style.display = 'flex';
    const earnedReset = document.getElementById('slEarned');
    if (earnedReset) earnedReset.textContent = '+0';
    const penaltyReset = document.getElementById('slPenalty');
    if (penaltyReset) penaltyReset.textContent = '-0';
    // Hide back button if in battle
    const backBtn = gp.querySelector('button');
    if (backBtn && (GAME_STATE.battles?.active)) {
      backBtn.style.display = 'none';
    }
    _startSlGame();
  }
}

function tapSpotlightReveal() {
  if (SPOTLIGHT_STATE.phase !== 'singleReveal') return;
  SPOTLIGHT_STATE.phase = 'revealing';
  const inner = document.getElementById('slSingleCardInner');
  // Flip to front
  inner.style.transform = 'rotateY(180deg)';
  // Flip back after 0.5s, then transition to grid
  setTimeout(() => {
    inner.style.transform = 'rotateY(0deg)';
    setTimeout(() => {
      // Fade out reveal, fade in grid
      const rv = document.getElementById('slRevealPhase');
      const gp = document.getElementById('slGridPhase');
      rv.style.transition = 'opacity 0.35s ease';
      rv.style.opacity = '0';
      setTimeout(() => {
        rv.style.display = 'none';
        rv.style.opacity = '1';
        rv.style.transition = '';
        gp.style.display = 'flex';
        gp.style.flexDirection = 'column';
        gp.style.opacity = '0';
        gp.style.transition = 'opacity 0.35s ease';
        SPOTLIGHT_STATE.phase = 'grid';
        document.getElementById('slEarned').textContent = '+0';
        // ★ Hide the back arrow when playing a battle
        const backBtn = gp.querySelector('button');
        if (backBtn && GAME_STATE.battles?.active) {
          backBtn.style.display = 'none';
        }
        setTimeout(() => {
          gp.style.opacity = '1';
        }, 30);
        setTimeout(() => {
          gp.style.transition = '';
        }, 400);
        _startSlGame();
      }, 360);
    }, 520); // 0.5s reveal + flip-back animation
  }, 500);
}

function _startSlGame() {
  SPOTLIGHT_STATE.timeLeft = 20;
  const isBattle = !!GAME_STATE.battles?.active;
  if (isBattle) {
    SPOTLIGHT_STATE.correctHits = 0;
    SPOTLIGHT_STATE.wrongHits = 0;
    document.getElementById('slEarned').textContent = '0';
    document.getElementById('slPenalty').textContent = '0';
    document.getElementById('slEarnedLabel').textContent = 'Correct';
    document.getElementById('slPenaltyLabel').textContent = 'Wrong';
  } else {
    document.getElementById('slEarned').textContent = '+0';
    document.getElementById('slPenalty').textContent = '-0';
    document.getElementById('slEarnedLabel').textContent = 'Earned';
    document.getElementById('slPenaltyLabel').textContent = 'Penalty';
  }
  SPOTLIGHT_STATE.earnedCoins = 0;
  SPOTLIGHT_STATE.lostCoins = 0;
  SPOTLIGHT_STATE.revealIdx = 0;
  SPOTLIGHT_STATE._currentRevealBatch = [];
  SPOTLIGHT_STATE._activeRevealEntries = [];
  SPOTLIGHT_STATE._currentRevealEl = null;
  SPOTLIGHT_STATE._currentRevealIsTarget = false;
  SPOTLIGHT_STATE.clickedThisReveal = false;
  const timerEl = document.getElementById('slTimer');
  timerEl.textContent = '20';
  SPOTLIGHT_STATE.gameTimerId = setInterval(() => {
    SPOTLIGHT_STATE.timeLeft--;
    timerEl.textContent = String(SPOTLIGHT_STATE.timeLeft);
    if (SPOTLIGHT_STATE.timeLeft <= 0) {
      clearInterval(SPOTLIGHT_STATE.gameTimerId);
      _endSlGame();
    }
  }, 1000);
  const battleCtx = GAME_STATE.battles?.active;
  if (battleCtx && battleCtx.sharedSpotlightSpec?.revealSchedule) {
    SPOTLIGHT_STATE.revealSchedule = battleCtx.sharedSpotlightSpec.revealSchedule;
    SPOTLIGHT_STATE.scheduleIdx = 0;
    _processRevealSchedule(); // start playing events at their time
  } else {
    // keep old random behaviour for non‑battle games
    setTimeout(_scheduleSlReveal, 600);
  }
}

function _processRevealSchedule() {
  if (SPOTLIGHT_STATE.phase !== 'grid') return;
  const sched = SPOTLIGHT_STATE.revealSchedule;
  if (!sched || SPOTLIGHT_STATE.scheduleIdx >= sched.length) return;
  const now = 20 - SPOTLIGHT_STATE.timeLeft; // seconds elapsed
  while (SPOTLIGHT_STATE.scheduleIdx < sched.length && sched[SPOTLIGHT_STATE.scheduleIdx].timeSec <= now) {
    const ev = sched[SPOTLIGHT_STATE.scheduleIdx];
    const cells = document.querySelectorAll('#slGrid .sl-card');
    if (cells[ev.cardIdx]) {
      const card = cells[ev.cardIdx];
      // update the card's front to show the correct idol
      card.innerHTML = `
        <div class="sl-card-back"> … </div>
        <div class="sl-card-front" style="border:4px solid ${rarityDotColor(ev.rarity)};">
          <img src="${ev.src}" alt="${ev.display}" />
          <div class="sl-name">${ev.display}</div>
        </div>
      `;
      card.classList.add('sl-revealed');
      card._slIsTarget = ev.isTarget;
      // hide after showDuration
      setTimeout(() => {
        card.classList.remove('sl-revealed');
        card._slIsTarget = false;
      }, ev.showDuration * 1000);
    }
    SPOTLIGHT_STATE.scheduleIdx++;
  }
  // schedule next check
  if (SPOTLIGHT_STATE.scheduleIdx < sched.length) {
    const nextTime = sched[SPOTLIGHT_STATE.scheduleIdx].timeSec;
    const delay = (nextTime - now) * 1000;
    if (delay > 0) setTimeout(_processRevealSchedule, delay + 50); // +50ms to avoid race
  }
}

function _slRandomImg(idolKey) {
  const raw = IDOL_IMAGES[idolKey] || ['2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg'];
  const imgs = raw.filter(f => f !== '1.jpg');
  const pool = imgs.length > 0 ? imgs : raw; // fallback to full list if needed
  return pool[Math.floor(Math.random() * pool.length)];
}
// Track how many cards are currently revealed
// Add to SPOTLIGHT_STATE initialization:
// activeRevealCount: 0,

function _scheduleSlReveal() {
  if (SPOTLIGHT_STATE.phase !== 'grid') return;
  if (SPOTLIGHT_STATE.timeLeft <= 0) return;
  // Count currently revealed cards
  const currentlyRevealed = document.querySelectorAll('#slGrid .sl-card.sl-revealed').length;
  // If already at max (3), wait and retry
  if (currentlyRevealed >= 3) {
    setTimeout(_scheduleSlReveal, 150);
    return;
  }
  const cards = document.querySelectorAll('#slGrid .sl-card');
  if (!cards.length) return;
  // Pick ONE card to reveal (not already revealed)
  const unrevealed = [...cards].filter(c => !c.classList.contains('sl-revealed'));
  if (!unrevealed.length) {
    setTimeout(_scheduleSlReveal, 200);
    return;
  }
  // Chance depends on elapsed time: first 10 seconds → 40%, then 20%
  const chance = SPOTLIGHT_STATE.timeLeft > 10 ? 0.40 : 0.20;
  const showTarget = Math.random() < chance;
  let idolKey, display, src, rarity, isTarget = false;
  // Pick a random unrevealed card position
  const targetPos = Math.floor(Math.random() * unrevealed.length);
  const el = unrevealed[targetPos];
  if (showTarget) {
    isTarget = true;
    idolKey = SPOTLIGHT_STATE.targetKey;
    display = SPOTLIGHT_STATE.targetDisplay;
    rarity = SPOTLIGHT_STATE.targetRarity;
    src = (idolKey === 'kkuma' ? './imgs/kkuma/' : `./imgs/${idolKey}/`) + _slRandomImg(idolKey);
  } else {
    const nonTargetKeys = Object.keys(IDOL_IMAGES).filter(k => k !== 'kkuma' && k !== SPOTLIGHT_STATE.targetKey);
    idolKey = nonTargetKeys[Math.floor(Math.random() * nonTargetKeys.length)];
    const idol = IDOLS.find(x => x.key === idolKey);
    display = idol ? idol.display : idolKey;
    rarity = IDOL_RARITY[idolKey] || 'rare';
    src = `./imgs/${idolKey}/` + _slRandomImg(idolKey);
  }
  // Update the single card's content
  const fi = el.querySelector('.sl-card-front img');
  const fn = el.querySelector('.sl-name');
  const fd = el.querySelector('.sl-card-front');
  if (fi) fi.src = src;
  if (fn) fn.textContent = display;
  if (fd) {
    fd.style.borderColor = rarityDotColor(rarity);
    fd.style.borderWidth = '4px';
  }
  // Store metadata on element for click handler
  el._slIsTarget = isTarget;
  el._slIdolKey = idolKey;
  // Update the current batch for click detection
  // We build a single-item "batch" and merge with existing revealed batch
  const newEntry = {
    pos: targetPos,
    el,
    isTarget,
    idolKey,
    display,
    src,
    rarity
  };
  // Initialize or update the active reveals tracking
  if (!SPOTLIGHT_STATE._activeRevealEntries) {
    SPOTLIGHT_STATE._activeRevealEntries = [];
  }
  SPOTLIGHT_STATE._activeRevealEntries.push(newEntry);
  // Update batch reference for click handler (include ALL currently active)
  SPOTLIGHT_STATE._currentRevealBatch = [...SPOTLIGHT_STATE._activeRevealEntries];
  if (isTarget) {
    SPOTLIGHT_STATE._currentRevealEl = el;
    SPOTLIGHT_STATE._currentRevealIsTarget = true;
  }
  SPOTLIGHT_STATE.clickedThisReveal = false;
  el.classList.add('sl-revealed');
  // Each card hides itself individually after a random duration (600–900ms)
  const showDuration = 600 + Math.floor(Math.random() * 500);
  setTimeout(() => {
    el.classList.remove('sl-revealed');
    el._slIsTarget = false;
    // Remove from active entries
    if (SPOTLIGHT_STATE._activeRevealEntries) {
      const idx = SPOTLIGHT_STATE._activeRevealEntries.indexOf(newEntry);
      if (idx >= 0) SPOTLIGHT_STATE._activeRevealEntries.splice(idx, 1);
      SPOTLIGHT_STATE._currentRevealBatch = [...SPOTLIGHT_STATE._activeRevealEntries];
    }
  }, showDuration);
  // Schedule NEXT individual card reveal at a random gap (200–500ms)
  const nextGap = 200 + Math.floor(Math.random() * 300);
  setTimeout(_scheduleSlReveal, nextGap);
}

function _onSlCardClick(el, card) {
  if (SPOTLIGHT_STATE.phase !== 'grid') return;
  if (!el.classList.contains('sl-revealed')) return;
  if (SPOTLIGHT_STATE.clickedThisReveal) return;
  SPOTLIGHT_STATE.clickedThisReveal = true;
  const batch = SPOTLIGHT_STATE._currentRevealBatch || [];
  const entry = batch.find(b => b.el === el);
  const correct = entry ? entry.isTarget : false;
  const isBattle = !!GAME_STATE.battles?.active;
  if (correct) {
    if (isBattle) {
      SPOTLIGHT_STATE.correctHits = (SPOTLIGHT_STATE.correctHits || 0) + 1;
      document.getElementById('slEarned').textContent = String(SPOTLIGHT_STATE.correctHits);
      _showSlFeedback(el, 1);
    } else {
      const delta = 100;
      SPOTLIGHT_STATE.earnedCoins = (SPOTLIGHT_STATE.earnedCoins || 0) + delta;
      SPOTLIGHT_STATE.correctHits++;
      document.getElementById('slEarned').textContent = '+' + SPOTLIGHT_STATE.earnedCoins;
      _showSlFeedback(el, delta);
    }
  } else {
    if (isBattle) {
      SPOTLIGHT_STATE.wrongHits = (SPOTLIGHT_STATE.wrongHits || 0) + 1;
      document.getElementById('slPenalty').textContent = String(SPOTLIGHT_STATE.wrongHits);
      _showSlFeedback(el, -1);
    } else {
      const delta = 50;
      SPOTLIGHT_STATE.lostCoins = (SPOTLIGHT_STATE.lostCoins || 0) + delta;
      SPOTLIGHT_STATE.wrongHits++;
      document.getElementById('slPenalty').textContent = '-' + SPOTLIGHT_STATE.lostCoins;
      _showSlFeedback(el, -delta);
    }
  }
  // clean up the revealed card
  el.classList.remove('sl-revealed');
  el._slIsTarget = false;
  if (entry) {
    const idx = SPOTLIGHT_STATE._activeRevealEntries.indexOf(entry);
    if (idx >= 0) SPOTLIGHT_STATE._activeRevealEntries.splice(idx, 1);
    SPOTLIGHT_STATE._currentRevealBatch = [...SPOTLIGHT_STATE._activeRevealEntries];
  }
}

function _showSlFeedback(cardEl, delta) {
  const grid = document.getElementById('slGrid');
  if (!grid) return;
  const cr = cardEl.getBoundingClientRect();
  const gr = grid.getBoundingClientRect();
  const fly = document.createElement('div');
  if (delta > 0) fly.textContent = '+' + delta;
  else if (delta < 0) fly.textContent = '' + delta;
  else fly.textContent = 'MISS';
  fly.style.cssText = `
    position:absolute;
    left:${cr.right-gr.left-6}px;
    top:${cr.top-gr.top+4}px;
    font-size:28px;font-weight:900;
    color:${delta>0?'#16a34a':delta<0?'#dc2626':'#94a3b8'};
    pointer-events:none;z-index:300;
    animation:slFly 0.9s ease forwards;
    white-space:nowrap;
  `;
  grid.appendChild(fly);
  setTimeout(() => fly.remove(), 950);
}

function _endSlGame() {
  const battleCtx = GAME_STATE.battles?.active;
  SPOTLIGHT_STATE.phase = 'done';
  if (SPOTLIGHT_STATE.revealTimerId) clearTimeout(SPOTLIGHT_STATE.revealTimerId);
  if (SPOTLIGHT_STATE.gameTimerId) clearInterval(SPOTLIGHT_STATE.gameTimerId);
  // Remove all revealed cards and clear batch
  document.querySelectorAll('#slGrid .sl-card.sl-revealed').forEach(c => c.classList.remove('sl-revealed'));
  SPOTLIGHT_STATE._currentRevealBatch = [];
  SPOTLIGHT_STATE._activeRevealEntries = [];
  SPOTLIGHT_STATE._currentRevealEl = null;
  // Hide all spotlight phase layers so they don't sit on top of the result modal
  ['slCountdown','slRevealPhase','slGridPhase'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const earned = SPOTLIGHT_STATE.earnedCoins || 0;
  const lost = SPOTLIGHT_STATE.lostCoins || 0;
  const net = earned - lost;
  const correctHits = SPOTLIGHT_STATE.correctHits || 0;
  const wrongHits = SPOTLIGHT_STATE.wrongHits || 0;
  if (battleCtx) {
    // ── Battle mode: NO coins, NO progression ───
    finalizeSpotlightBattle(correctHits - wrongHits);
    savePlayerState();
    renderHub();
    // Show battle result modal
    const modalBody = `
      <div class="glass-card rounded-2xl p-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="text-center">
            <div style="font-size:28px;font-weight:900;color:#16a34a;">${correctHits}</div>
            <div class="text-xs text-gray-500 font-bold">Correct</div>
          </div>
          <div class="text-center">
            <div style="font-size:28px;font-weight:900;color:#dc2626;">${wrongHits}</div>
            <div class="text-xs text-gray-500 font-bold">Wrong</div>
          </div>
        </div>
      </div>
      <div class="earn-row" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));border:none;">
        <div class="label font-black">Final Score</div>
        <div class="val font-black">${correctHits - wrongHits}</div>
      </div>
      <div class="grid grid-cols-1 gap-3 pt-2">
        <button class="btn-theme black-text" onclick="closeModal(); renderHub(); showScreen('hubScreen');">Back to Hub</button>
      </div>
    `;
    openUndismissibleModal('Battle Completed!', modalBody);
    return;
  }
  // ── Normal game: apply progression ───
  const passedSpotlight = correctHits >= 5;  // BUG-G09: single source of truth
  // PATCH BUG4: compute & credit coins FIRST so balance is correct before any modal/box fires
  GAME_STATE.stats.spotlightBestCorrect = Math.max(GAME_STATE.stats.spotlightBestCorrect || 0, correctHits);
  if (correctHits >= 7) {
    GAME_STATE.spotlightStreak = (GAME_STATE.spotlightStreak || 0) + 1;
    if ((GAME_STATE.stats.spotlightBestStreak || 0) < GAME_STATE.spotlightStreak) {
      GAME_STATE.stats.spotlightBestStreak = GAME_STATE.spotlightStreak;
    }
  } else {
    GAME_STATE.spotlightStreak = 0;
  }
  const streakBonusCoins = (GAME_STATE.spotlightStreak || 0) * 10;
  let kkumaBonus = 0;
  if (SPOTLIGHT_STATE.isKkuma) {
    kkumaBonus = 5000;
    GAME_STATE.stats.kkumaHits = (GAME_STATE.stats.kkumaHits || 0) + 1;
  }
  const totalReward = net + streakBonusCoins + kkumaBonus;
  if (totalReward > 0) {
    addCoinsToGame(totalReward, 'spotlight'); // PATCH BUG4: credited before box/modal
  }
  if (passedSpotlight) {
    GAME_STATE.spotlightLevel = (GAME_STATE.spotlightLevel || 0) + 1;
    // L99: grant a daily box for completing a Spotlight level
    ensureDailyResetIfNeeded();
    const _spWins = GAME_STATE.daily.wins || 0;
    if (_spWins < 6) {
      GAME_STATE.daily.wins = _spWins + 1;
      if (isDailyBoxReady()) {
        // FIX BUG2: pre-resolve star + reward NOW (mirrors levelComplete path)
        let _slPreviewStar = 1;
        GAME_STATE.daily.box.star = 1;
        for (let _a = 0; _a < 4; _a++) {
          if (_slPreviewStar >= 5) break;
          const _p = STAR_UPGRADE_PROB[_slPreviewStar] || 0;
          if (Math.random() < _p) _slPreviewStar = Math.min(5, _slPreviewStar + 1);
        }
        GAME_STATE.daily.box.star = _slPreviewStar;
        const _slReward = resolveDailyBoxReward(_slPreviewStar);
        const _slBeforeCoins = GAME_STATE.coins;
        addCoinsToGame((_slReward.coins || 0), 'dailybox');
        markNextUnclaimedDailyWinCellClaimed();   // claim cell before any UI
        resetDailyBoxStarForNextClaim();
        GAME_STATE.daily.box.star = _slPreviewStar;
        updateDailySixBoxesUI();
        savePlayerState();
        // FIX BUG1: close result modal before launching fullscreen
        setTimeout(() => {
          closeModal();
          __dailyBoxAttempts = 4;
          __dailyBoxPhase = "upgrade";
          __dailyBoxPreResolved = {
            reward: _slReward,
            finalStar: _slPreviewStar,
            beforeCoins: _slBeforeCoins,
            // PATCH2b: re-open the Spotlight result modal after fullscreen closes
            onClose: (function(_kb, _sb, _ps) {
              return function() { _openSlResultModal(_kb, _sb, _ps); };
            })(kkumaBonus, streakBonusCoins, passedSpotlight)
          };
          showDailyBoxFullscreen();
        }, 400);
      } else {
        updateDailySixBoxesUI();
      }
    }
  }
  try { Meta.onRunComplete('spotlight', { passed: passedSpotlight, elite: correctHits >= 7, coins: totalReward, targetKey: SPOTLIGHT_STATE.isKkuma ? null : SPOTLIGHT_STATE.targetKey }); } catch (e) { console.warn('[Meta]', e); }
  savePlayerState();
  renderHub();
  // BUG-G09b: passedSpotlight already declared above
  if (passedSpotlight) fireLevelSuccessBurst();
  _openSlResultModal(kkumaBonus, streakBonusCoins, passedSpotlight);
}

function _openSlResultModal(kkumaBonus, streakBonusCoins, passedLevel = false) {
  streakBonusCoins = streakBonusCoins || 0;
  const earned = SPOTLIGHT_STATE.earnedCoins || 0;
  const lost = SPOTLIGHT_STATE.lostCoins || 0;
  const net = earned - lost;
  const total = net + kkumaBonus + streakBonusCoins;
  const streakCount = GAME_STATE.spotlightStreak || 0;
  const kRow = kkumaBonus ? `
    <div class="earn-row">
        <div class="label">🐾 Kkuma Bonus</div>
        <div class="val">+5,000 <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
  ` : '';
  const title = passedLevel ? '✅ Level Complete!' : '❌ Level Failed';
  openUndismissibleModal(title, `
    <div class="glass-card rounded-2xl p-4">
        <div class="grid grid-cols-2 gap-3">
            <div class="text-center">
                <div style="font-size:28px;font-weight:900;color:#16a34a;">${SPOTLIGHT_STATE.correctHits}</div>
                <div class="text-xs text-gray-500 font-bold">Correct</div>
            </div>
            <div class="text-center">
                <div style="font-size:28px;font-weight:900;color:#dc2626;">${SPOTLIGHT_STATE.wrongHits}</div>
                <div class="text-xs text-gray-500 font-bold">Wrong</div>
            </div>
        </div>
    </div>
    <div class="earn-row">
        <div class="label">Earned (correct)</div>
        <div class="val">+${earned} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    <div class="earn-row" style="color:#dc2626;">
        <div class="label">Penalty (wrong)</div>
        <div class="val">-${lost} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    <div class="earn-row">
        <div class="label"><img src="./imgs/assets/fire.png" style="width:1em;height:1em;vertical-align:middle;"> Streak Bonus (${streakCount}×)</div>
        <div class="val">${streakBonusCoins > 0 ? '+' + streakBonusCoins : '0'} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    ${kRow}
    <div class="earn-row" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));border:none;">
        <div class="label font-black">Total earned</div>
        <div class="val font-black">${total >= 0 ? '+' : ''}${total} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">
        <button class="glass-card" style="padding:12px 0;font-size:14px;font-weight:700;color:#374151;border-radius:16px;"
            onclick="closeModal(); showScreen('hubScreen'); renderHub();">Back to Hub</button>
        <button class="btn-theme black-text" style="padding:14px 0;font-size:15px;font-weight:800;"
            onclick="closeModal(); openSpotlight();">
            ${passedLevel ? 'Next Level' : 'Retry'}
        </button>
    </div>
  `);
}

function exitSpotlight() {
  if (GAME_STATE.battles?.active) {
    showToast("Cannot quit a battle", "error");
    return;
  }
  // Only show confirmation if game is actively running
  if (SPOTLIGHT_STATE.phase === 'grid') {
    // Pause the timer
    clearInterval(SPOTLIGHT_STATE.gameTimerId);
    SPOTLIGHT_STATE.gameTimerId = null;
    SPOTLIGHT_STATE._timerPausedAt = SPOTLIGHT_STATE.timeLeft;
    openUndismissibleModal('Exit Spotlight?', `
      <div class="glass-card rounded-2xl p-4 space-y-2">
        <p class="text-sm text-gray-700 font-semibold">If you exit now:</p>
        <ul class="text-xs text-gray-600 font-bold list-disc pl-5 space-y-1">
          <li>All coins earned this round will be lost.</li>
          <li>This will not count towards your Spotlight level.</li>
          <li>No progress will be saved.</li>
        </ul>
      </div>
      <div class="grid grid-cols-2 gap-3 pt-2">
        <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900"
          onclick="resumeSpotlightAfterCancel()">Keep Playing</button>
        <button class="btn-confirm-no"
          onclick="confirmExitSpotlight()">Exit</button>
      </div>
    `);
    return;
  }
  // If not in active grid phase, just exit directly
  _forceExitSpotlight();
}

function resumeSpotlightAfterCancel() {
  closeModal();
  // Resume the timer from where it paused
  const remaining = SPOTLIGHT_STATE._timerPausedAt ?? SPOTLIGHT_STATE.timeLeft;
  SPOTLIGHT_STATE.timeLeft = remaining;
  const timerEl = document.getElementById('slTimer');
  if (timerEl) timerEl.textContent = String(remaining);
  // G-06: always clear any previous interval before starting a new one
  if (SPOTLIGHT_STATE.gameTimerId) {
    clearInterval(SPOTLIGHT_STATE.gameTimerId);
    SPOTLIGHT_STATE.gameTimerId = null;
  }
  SPOTLIGHT_STATE.gameTimerId = setInterval(() => {
    SPOTLIGHT_STATE.timeLeft--;
    if (timerEl) timerEl.textContent = String(SPOTLIGHT_STATE.timeLeft);
    if (SPOTLIGHT_STATE.timeLeft <= 0) {
      clearInterval(SPOTLIGHT_STATE.gameTimerId);
      _endSlGame();
    }
  }, 1000);
}

function confirmExitSpotlight() {
  closeModal();
  _forceExitSpotlight();
}

async function finalizeSpotlightBattle(hits) {
  ensureBattlesDefaults();
  const ctx = GAME_STATE.battles.active;
  if (!ctx || ctx.type !== "friend" && ctx.type !== "friend_reply") return;
  const battleId = ctx.battleId;
  if (ctx.type === "friend") {
    const b = GAME_STATE.battles.pendingOutgoing.find(x => x.id === battleId);
    if (b) {
      b.fromHits = hits;
      b.status = "waiting_opponent";
    }
    if (db && ctx.opponentUserId) {
      const ref = db.ref(`users/${ctx.opponentUserId}/playerState/battles/pendingIncoming`);
      const snap = await ref.once('value');
      const arr = snap.val() || [];
      const list = Array.isArray(arr) ? arr : Object.values(arr);
      list.forEach(x => {
        if (x.id === battleId) {
          x.fromHits = hits;
          x.status = "awaiting_accept";
        }
      });
      await ref.set(list);
    }
    GAME_STATE.battles.active = null;
    await savePlayerState();
    showToast("Your score saved!", "info");
    return;
  }
  // ctx.type === "friend_reply"
  const b = GAME_STATE.battles.pendingIncoming.find(x => x.id === battleId);
  if (!b) {
    GAME_STATE.battles.active = null;
    return;
  }
  b.toHits = hits;
  b.status = "completed";
  // SECURITY FIX [3]: validate score
  const myHits = _validateBattleScore('spotlight', hits);
  const oppHits = _validateBattleScore('spotlight', Number(b.fromHits ?? 0));  // S-08: validate opponent score too
  // Determine winner / tie from MY perspective
  let youWin = false;
  let tie = false;
  if (myHits > oppHits) {
    youWin = true;
  } else if (myHits < oppHits) {
    youWin = false;
  } else {
    tie = true;
  }
  if (!tie) {
    if (youWin) {
      GAME_STATE.stats.battleWins = (GAME_STATE.stats.battleWins || 0) + 1;
    } else {
      GAME_STATE.stats.battleLosses = (GAME_STATE.stats.battleLosses || 0) + 1;
    }
  }
  const meMeta = {
    userId: currentUser.id,
    username: currentUser.username,
    displayName: currentUser.displayName || currentUser.username,
    avatarSrc: equippedAvatarSrc()
  };
  const oppMeta = {
    userId: b.fromUserId,
    username: b.fromUsername,
    displayName: b.fromDisplayName || b.fromUsername,
    avatarSrc: './imgs/assets/default_avatar.png'
  };
  // (Optional: try to load the opponent's actual avatar from DB)
  if (db && b.fromUserId) {
    try {
      const snap = await db.ref(`users/${b.fromUserId}/playerState`).once('value').catch(() => null);
      const ps = snap?.val() || null;
      if (ps?.equippedIdolKey) oppMeta.avatarSrc = `./imgs/${ps.equippedIdolKey}/1.jpg`;
    } catch (e) {}
  }
  const logId = `log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const logEntry = {
    game: 'spotlight',
    id: logId,
    completedAt: Date.now(),
    youHits: myHits,
    oppHits: oppHits,
    tie: tie,
    winnerLabel: tie ? "Tie" : (youWin ? "You" : (b.fromDisplayName || b.fromUsername)),
  };
  if (tie) {
    logEntry.player1 = meMeta;
    logEntry.player2 = oppMeta;
    logEntry.winner = null;
    logEntry.loser = null;
  } else {
    logEntry.winner = youWin ? meMeta : oppMeta;
    logEntry.loser = youWin ? oppMeta : meMeta;
  }
  GAME_STATE.battles.logs.push(logEntry);
  GAME_STATE.battles.pendingIncoming = GAME_STATE.battles.pendingIncoming.filter(x => x.id !== b.id);
  if (db) {
    // Save my own pendingIncoming removal + logs
    await db.ref(`users/${currentUser.id}/playerState/battles/pendingIncoming`).set(GAME_STATE.battles.pendingIncoming);
    await db.ref(`users/${currentUser.id}/playerState/battles/logs`).set(GAME_STATE.battles.logs);
    // Push mirrored log to opponent
    const oppRef = db.ref(`users/${b.fromUserId}/playerState`);
    const oppSnap = await oppRef.once('value');
    const oppPS = oppSnap.val() || {};
    oppPS.battles ||= {
      pendingIncoming: [],
      pendingOutgoing: [],
      logs: [],
      seenLogIds: {}
    };
    oppPS.battles.pendingOutgoing = (oppPS.battles.pendingOutgoing || []).filter(x => x.id !== b.id);
    // Compute win/loss from the OPPONENT's perspective (correct fix)
    const oppWin = oppHits > myHits;
    const oppTie = oppHits === myHits;
    const oppLogId = `log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const oppLogEntry = {
      game: 'spotlight',
      id: oppLogId,
      completedAt: Date.now(),
      youHits: oppHits, // the opponent's own hits
      oppHits: myHits, // my hits
      tie: oppTie,
      winnerLabel: oppTie ? "Tie" : (oppWin ? oppMeta.displayName : meMeta.displayName),
    };
    if (oppTie) {
      oppLogEntry.player1 = oppMeta;
      oppLogEntry.player2 = meMeta;
      oppLogEntry.winner = null;
      oppLogEntry.loser = null;
    } else {
      oppLogEntry.winner = oppWin ? oppMeta : meMeta;
      oppLogEntry.loser = oppWin ? meMeta : oppMeta;
    }
    oppPS.battles.logs.push(oppLogEntry);
    // SECURITY FIX [4]: Surgical update — never overwrite full playerState.
    const _slOppUpdates = {};
    _slOppUpdates[`users/${b.fromUserId}/playerState/battles/logs`]          = oppPS.battles.logs;
    _slOppUpdates[`users/${b.fromUserId}/playerState/battles/pendingOutgoing`] = oppPS.battles.pendingOutgoing;
    if (!oppTie) {
      const _winKey = oppWin ? 'battleWins' : 'battleLosses';
      _slOppUpdates[`users/${b.fromUserId}/playerState/stats/${_winKey}`] =
        (oppPS.stats?.[_winKey] || 0) + 1;
    }
    await db.ref().update(_slOppUpdates);
  }
  GAME_STATE.battles.active = null;
  await savePlayerState();
  updateNewsBadge();
  let message = 'Battle complete! ';
  if (tie) {
    message += 'Tie!';
  } else {
    message += youWin ? 'You win!' : 'You lose!';
  }
  showToast(message, "success");
}

function _forceExitSpotlight() {
  // ✅ RESET SPOTLIGHT STREAK
  GAME_STATE.spotlightStreak = 0;
  __blockSavesUntil = 0;
  savePlayerState();
  // Update streak display on hub (optional – renderHub will do it later)
  const streakEl = document.getElementById('spotlightStreakCount');
  if (streakEl) streakEl.textContent = '0';
  SPOTLIGHT_STATE.phase = 'done';
  if (SPOTLIGHT_STATE.revealTimerId) clearTimeout(SPOTLIGHT_STATE.revealTimerId);
  if (SPOTLIGHT_STATE.gameTimerId) clearInterval(SPOTLIGHT_STATE.gameTimerId);
  showScreen('hubScreen');
  renderHub();
}
