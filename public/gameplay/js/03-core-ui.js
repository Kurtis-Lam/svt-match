// Love XP requirement per level (1..100)
const LOVE_XP_REQ = new Proxy({}, {
  get: function(target, prop) {
    if (prop in target || typeof prop === 'symbol' || isNaN(prop)) {
      return target[prop];
    }
    const lvl = Number(prop);
    if (lvl <= 0) return 0;
    return Math.floor(250 * Math.pow(1.08, lvl - 1));
  }
});

let __blockSavesUntil = 0;
// ─── STACKABLE ABILITY PAUSE/RESUME ────────────────────────────────────
let _stackableEffects = []; // { type, remainingMs, rate?, restoreFn }

function _pauseAllStackableEffects() {
  // Pause any active stackable effects (Rain slow, Cheat freeze)
  const now = performance.now();
  _stackableEffects.forEach(eff => {
    if (eff.type === 'rain') {
      // Rain: slowUntil may be in the future
      const remaining = Math.max(0, (GAME_STATE.runtime.slowUntil - now) / 1000);
      eff.remainingMs = remaining * 1000;
      GAME_STATE.runtime.slowUntil = now; // stop slowing immediately
    } else if (eff.type === 'cheat') {
      // Cheat: frozenUntil
      const remaining = Math.max(0, (GAME_STATE.runtime.frozenUntil - now) / 1000);
      eff.remainingMs = remaining * 1000;
      GAME_STATE.runtime.frozenUntil = now;
    }
  });
}

function _resumeAllStackableEffects() {
  const now = performance.now();
  _stackableEffects.forEach(eff => {
    if (eff.type === 'rain') {
      GAME_STATE.runtime.slowStartMs = now;
      GAME_STATE.runtime.slowUntil = now + eff.remainingMs;
      GAME_STATE.runtime.slowRate = eff.rate;
    } else if (eff.type === 'cheat') {
      GAME_STATE.runtime.frozenUntil = now + eff.remainingMs;
    }
  });
  _stackableEffects = []; // clear after resuming; effects will end when time passes
}
// Modified useActiveAbility will use these at start and end.
// We'll wrap existing useActiveAbility function later.
// ─── Mingyu Golden Aura ────────────────────────────────────────────────

async function mingyuGoldenAura(durationSec) {
  const grid = document.getElementById('cardGrid');
  const allCards = getAllCardElements();
  const unmatched = allCards.filter(c => !c.classList.contains('matched') && c.dataset.permanent !== 'true');
  if (unmatched.length < 2) {
    showToast('Not enough unmatched cards', 'info');
    return;
  }
  // Reveal only HALF of unmatched cards (matching description)
  const halfCount = Math.max(1, Math.floor(unmatched.length / 2));
  const shuffledUnmatched = [...unmatched].sort(() => Math.random() - 0.5);
  const toReveal = shuffledUnmatched.slice(0, halfCount);
  // Freeze timer for full animation duration
  pauseTimerFor(durationSec + 1.0); // enough for lift + reveal + drop
  // ----- 1️⃣ Record ground positions (before any transformation) -----
  // Record ALL unmatched cards (not just toReveal) so the drop animation
  // can correctly FLIP every card back to its pre-shuffle screen position.
  const groundPositions = {};
  unmatched.forEach(c => {
    groundPositions[c.dataset.cardId] = c.getBoundingClientRect();
  });
  // ----- 2️⃣ Lift + reveal half unmatched cards -----
  toReveal.forEach(c => {
    c.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
    c.style.transform = 'translateY(-80px) scale(1.03)';
    if (!c.classList.contains('flipped')) c.classList.add('flipped');
  });
  await sleep(400); // lift complete
  // ----- 3️⃣ Wait for reveal time -----
  await sleep(durationSec * 1000);
  // ----- 4️⃣ Hide cards (flip back + make invisible) -----
  toReveal.forEach(c => {
    c.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    c.style.transform = 'translateY(0) scale(1)'; // return to ground
    c.style.opacity = '0';
  });
  // Also flip back
  toReveal.forEach(c => {
    if (!c.dataset.permanent) c.classList.remove('flipped');
  });
  await sleep(350); // hide animation
  // ----- 5️⃣ Shuffle only the revealed cards (new order) -----
  const shuffled = [...toReveal];
  shuffle(shuffled);
  // Remove revealed cards from grid, then re‑append in shuffled order
  toReveal.forEach(c => c.remove());
  shuffled.forEach(c => grid.appendChild(c));
  // ----- 6️⃣ Record new positions -----
  const newPositions = {};
  getAllCardElements().forEach(c => {
    newPositions[c.dataset.cardId] = c.getBoundingClientRect();
  });
  // ----- 7️⃣ FLIP + drop animation (snap to old ground, then spring to new) -----
  getAllCardElements().forEach(card => {
    const old = groundPositions[card.dataset.cardId]; // use pre‑lift positions
    if (!old) return;
    const newR = newPositions[card.dataset.cardId];
    const dx = old.left - newR.left;
    const dy = old.top - newR.top;
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    card.style.opacity = '1';
  });
  // Force reflow
  void grid.offsetWidth;
  // Animate to final position with a bounce‑like drop
  getAllCardElements().forEach(card => {
    card.style.transition = 'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)';
    card.style.transform = 'translate(0, 0)';
  });
  await sleep(650); // drop finished
  // Clean up styles
  getAllCardElements().forEach(c => {
    c.style.transition = '';
    c.style.transform = '';
    c.style.opacity = '';
  });
  showToast("Golden Aura shuffled all cards!", "info");
}

function isSaveBlocked() {
  return Date.now() < __blockSavesUntil;
}
let IDOL_SORT_MODE = "rarity";
const BASE_DAILY_PRIZES = [1000, 750, 500, 250, 100, 50, 25, 10];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
let DAILY_PRIZES = shuffled(BASE_DAILY_PRIZES);

function randomDailyPrize() {
  return DAILY_PRIZES[Math.floor(Math.random() * DAILY_PRIZES.length)];
}
// DAILY RESET ...

function ensureDailyResetIfNeeded() {
  const today = hkDayKey();
  if (!GAME_STATE.daily) {
    GAME_STATE.daily = {
      dayKey: today,
      hasDrawn: false,
      wins: 0,
      claimedCellIndex: null,
      box: {
        claimed: false,
        opened: false,
        star: 1
      },
      claimedCells: [false, false, false, false, false, false] // L99
    };
    return;
  }
  if (GAME_STATE.daily.dayKey !== today) {
    GAME_STATE.daily.dayKey = today;
    GAME_STATE.daily.hasDrawn = false;
    GAME_STATE.daily.wins = 0;
    GAME_STATE.daily.claimedCellIndex = null;
    GAME_STATE.daily.claimedCells = [false, false, false, false, false, false]; // L99
    GAME_STATE.daily.box = {
      claimed: false,
      opened: false,
      star: 1
    };
    updateDailyDrawUI();
    updateDailyWinsUI();
    updateDailySixBoxesUI(); // L99
    savePlayerState();
  }
  if (!Array.isArray(GAME_STATE.daily.claimedCells) || GAME_STATE.daily.claimedCells.length !== 6) {
    GAME_STATE.daily.claimedCells = [false, false, false, false, false, false]; // L99
    savePlayerState(); // persist the migrated value immediately
  }
}
let __dailyResetWatcher = null;

function startDailyResetWatcher() {
  if (__dailyResetWatcher) clearInterval(__dailyResetWatcher);
  __dailyResetWatcher = setInterval(() => {
    ensureDailyResetIfNeeded();
  }, 30 * 1000);
}

function stopDailyResetWatcher() {
  if (__dailyResetWatcher) {
    clearInterval(__dailyResetWatcher);
    __dailyResetWatcher = null;
  }
}

function maybeAutoOpenDailyWheel() {
  if (!currentUser) return;
  ensureDailyResetIfNeeded();
  if (!GAME_STATE.daily.hasDrawn) setTimeout(() => openDailyWheelOverlay(), 350);
}

function updateDailyDrawUI() {
  const row = document.getElementById('dailyDrawRow');
  const statusEl = document.getElementById('dailyDrawStatus');
  const btn = document.getElementById('dailyDrawBtn');
  if (!row || !statusEl || !btn) return;
  ensureDailyResetIfNeeded();
  if (GAME_STATE.daily.hasDrawn) {
    row.classList.add('hidden');
  } else {
    row.classList.remove('hidden');
    statusEl.textContent = "Available";
    btn.textContent = "Spin";
    btn.disabled = false;
    btn.classList.remove('opacity-60');
  }
}

function boxImageForStar(star) {
  const s = Math.max(1, Math.min(5, Number(star || 1)));
  return `./imgs/boxes/${s}.jpg`;
}

function tickImagePath() {
  return `./imgs/boxes/tick.jpg`;
}

function flipImageOnceAndUpdate(imgEl, newSrc, flipDurationMs = 350) {
  if (!imgEl) return;
  imgEl.classList.add('flip-once');
  setTimeout(() => {
    imgEl.src = newSrc;
  }, Math.max(60, flipDurationMs * 0.5));
  setTimeout(() => {
    imgEl.classList.remove('flip-once');
  }, flipDurationMs + 40);
}

function openDailyWinsInfoModal() {
  // L99: kept for backward compat – delegates to new modal
  openDailyBoxInfoModal();
}

// L99: new info modal for six-box panel
function openDailyBoxInfoModal() {
  openModal("Daily Boxes", `
    <div class="glass-card rounded-2xl p-4">
      <p class="text-sm text-gray-700 font-semibold" style="line-height:1.6;">
        🎁 <b>6 Daily Boxes</b> are available every day.<br><br>
        To earn a daily box, <b>complete a level</b> from any minigame:<br>
        &nbsp;&nbsp;• 🎴 <b>Showtime</b> – finish within 30 secs<br>
        &nbsp;&nbsp;• 🔦 <b>Spotlight</b> – score 5+ correct taps<br>
        &nbsp;&nbsp;• 🐍 <b>Snakeventeen</b> – eat 4+ idols<br><br>
        Each completed level earns one box. Open it to win coins and
        a chance to upgrade its rarity!
      </p>
    </div>
  `);
}

function updateDailyWinsUI() {
  ensureDailyResetIfNeeded();
  const w = GAME_STATE.daily.wins || 0;
  // Always show the panel (never hide it)
  const panel = document.getElementById('dailyWinsPanel');
  if (panel) {
    panel.style.display = 'inline-grid';
  }
  // Make sure claimedCells exists and is an array of 3 booleans
  GAME_STATE.daily.claimedCells ||= [false, false, false, false, false, false]; // L99
  while (GAME_STATE.daily.claimedCells.length < 6) GAME_STATE.daily.claimedCells.push(false); // L99
  const c1 = document.getElementById('dw1');
  const c2 = document.getElementById('dw2');
  const c3 = document.getElementById('dw3');
  const i1 = document.getElementById('dw1Img');
  const i2 = document.getElementById('dw2Img');
  const i3 = document.getElementById('dw3Img');
  const star = 1; // star level is always 1 for the boxes
  // Decide image: tick if this cell is claimed, otherwise the box image
  const imgForSlot = (index) => {
    const isClaimed = GAME_STATE.daily.claimedCells[index] === true;
    return isClaimed ? tickImagePath() : boxImageForStar(star);
  };
  const setCell = (cellEl, imgEl, winReached, index) => {
    if (!cellEl || !imgEl) return;
    cellEl.classList.remove('todo', 'done');
    cellEl.classList.add(winReached ? 'done' : 'todo');
    const nextSrc = imgForSlot(index);
    const curSrc = imgEl.getAttribute('src') || '';
    // PATCH BUG1: normalise both sides so absolute URLs compare correctly
    const _normTarget1 = nextSrc.replace(/^\.\//, '');
    const _normCur1    = curSrc.replace(/^\.\//, '');
    if (!_normCur1.endsWith(_normTarget1)) {
      flipImageOnceAndUpdate(imgEl, nextSrc, 320);
    }
  };
  setCell(c1, i1, w > 0, 0);
  setCell(c2, i2, w > 1, 1);
  setCell(c3, i3, w > 2, 2);
}


// ── L99: updateDailySixBoxesUI ────────────────────────────────────────
function updateDailySixBoxesUI() {
  ensureDailyResetIfNeeded();
  const d = GAME_STATE.daily;
  d.claimedCells = d.claimedCells || [false,false,false,false,false,false];
  while (d.claimedCells.length < 6) d.claimedCells.push(false);
  // BUG3 FIX: daily-box slot thumbnails always show the base (grade-1)
  // box image regardless of how many upgrade attempts the player has made.
  const star = 1;
  for (let i = 0; i < 6; i++) {
    const cell = document.getElementById('dsb' + (i + 1));
    const img  = document.getElementById('dsb' + (i + 1) + 'Img');
    if (!cell || !img) continue;
    const earned  = i < (d.wins || 0);
    const claimed = d.claimedCells[i] === true;
    cell.classList.remove('done', 'todo');
    cell.classList.add(earned ? 'done' : 'todo');
    const targetSrc = claimed ? tickImagePath() : boxImageForStar(star);
    // BUG2 FIX: the old endsWith() guard was unreliable — the browser
    // stores the full absolute URL while targetSrc is a relative path,
    // so the comparison silently failed and the tick image was never shown.
    // Normalise both sides by stripping leading './' before comparing.
    const curSrc = img.getAttribute('src') || '';
    const normTarget = targetSrc.replace(/^\.\//,'');
    const normCur    = curSrc.replace(/^\.\//,'');
    if (!normCur.endsWith(normTarget)) {
      flipImageOnceAndUpdate(img, targetSrc, 320);
    }
  }
}

function openDailyDrawModal() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  ensureDailyResetIfNeeded();
  if (GAME_STATE.daily.hasDrawn) return;
  openDailyWheelOverlay();
}

function showScreen(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => {
    if (screen.id === screenId) screen.classList.remove('hidden', 'slide-left');
    else screen.classList.add('hidden');
  });
}

function openLevelRequirementModal(game) {
  const rules = {
    showtime: 'Showtime Level<br><br>Advance to next level: <b>Complete a round in 30 seconds or less.</b>',
    spotlight: 'Spotlight Level<br><br>Advance to next level: <b>Get at least 5 correct taps in one game.</b>',
    snakeventeen: 'Snakeventeen Level<br><br>Advance to next level: <b>Eat at least 4 idols during a game.</b>'
  };
  const message = rules[game] || 'Level rules not available.';
  openModal('Level Requirement', `
    <div class="glass-card rounded-2xl p-4 text-sm text-gray-700 font-semibold text-center">
      ${message}
    </div>
  `);
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}
// ── Star/sparkle particle burst — plays when a Showtime, Spotlight,
// or Snakeventeen level is completed successfully ──
function fireLevelSuccessBurst() {
  try {
    const host = document.querySelector('.app-container') || document.body;
    const burst = document.createElement('div');
    burst.className = 'svt-star-burst-overlay';
    const glyphs = ['✨', '⭐', '🌟'];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'svt-star-particle';
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 170;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 40; // slight upward bias
      const rot = Math.random() * 720 - 360;
      const delay = Math.random() * 150;
      p.style.setProperty('--svt-dx', dx.toFixed(1) + 'px');
      p.style.setProperty('--svt-dy', dy.toFixed(1) + 'px');
      p.style.setProperty('--svt-rot', rot.toFixed(0) + 'deg');
      p.style.setProperty('--svt-delay', delay.toFixed(0) + 'ms');
      p.style.left = (46 + Math.random() * 8) + '%';
      p.style.top = (38 + Math.random() * 8) + '%';
      p.style.fontSize = (14 + Math.random() * 20).toFixed(0) + 'px';
      p.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      burst.appendChild(p);
    }
    host.appendChild(burst);
    setTimeout(() => burst.remove(), 1300);
  } catch (e) {
    // Never let a cosmetic effect break the level-complete flow
    console.warn('fireLevelSuccessBurst failed', e);
  }
}

let __toastTimer = null;

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-slate-900'
  };
  if (__toastTimer) clearTimeout(__toastTimer);
  container.innerHTML = "";
  const toast = document.createElement('div');
  toast.className = `toast ${colors[type]} text-white shadow-lg flex items-center gap-2`;
  // PATCH S-02: escape message before inserting into innerHTML
  const iconClass = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  const safeMsg = escapeHtml(message);
  toast.innerHTML = `
    <i class="fas ${iconClass}"></i>
    <span>${safeMsg}</span>
  `;
  container.appendChild(toast);
  __toastTimer = setTimeout(() => {
    toast.remove();
    __toastTimer = null;
  }, 1800);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner mx-auto"></div>';
  } else {
    btn.disabled = false;
    if (btnId === 'loginBtn') btn.innerHTML = 'Login';
    else if (btnId === 'signupBtn') btn.innerHTML = 'Create Account';
    else if (btnId === 'settingsSaveBtn') btn.innerHTML = 'Save Display Name';
  }
}

function getActiveCoinsTargetEl() {
  const gameVisible = !document.getElementById('gameScreen').classList.contains('hidden');
  const questsVisible = !document.getElementById('questsScreen').classList.contains('hidden');
  const idolsVisible = !document.getElementById('idolsScreen').classList.contains('hidden');
  const friendsVisible = !document.getElementById('friendsScreen')?.classList.contains('hidden');
  const newsVisible = !document.getElementById('newsScreen')?.classList.contains('hidden');
  const shopVisible = !document.getElementById('shopScreen').classList.contains('hidden');
  if (gameVisible) return document.getElementById('coinsBarGame');
  if (questsVisible) return document.getElementById('coinsBarQuests');
  if (idolsVisible) return document.getElementById('coinsBarIdols');
  if (shopVisible) return document.getElementById('shopCoins');
  const avatarsVisible = !document.getElementById('avatarsScreen')?.classList.contains('hidden');
  if (avatarsVisible) return document.getElementById('avatarsCoins');  // G-07 FIX
  if (friendsVisible || newsVisible) return document.getElementById('coinsBarHub');
  return document.getElementById('coinsBarHub');
}

function animateNumber(el, from, to, duration = 450) {
  if (!el) return;
  const start = performance.now();
  const diff = to - from;

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = formatNumber(Math.floor(from + diff * e));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatNumber(to);
  }
  requestAnimationFrame(tick);
}

async function animateCoinsToBar(sourceEl, coinsAdded) {
  const targetEl = getActiveCoinsTargetEl();
  const coinLayer = document.getElementById('coinLayer');
  if (!sourceEl || !targetEl || !coinLayer) return;
  const appRect = document.getElementById('app').getBoundingClientRect();
  const s = sourceEl.getBoundingClientRect();
  const t = targetEl.getBoundingClientRect();
  const sx = (s.left + s.right) / 2 - appRect.left;
  const sy = (s.top + s.bottom) / 2 - appRect.top;
  const tx = (t.left + t.right) / 2 - appRect.left;
  const ty = (t.top + t.bottom) / 2 - appRect.top;
  const coinsCount = Math.max(14, Math.min(36, Math.round(coinsAdded / 20) + 12));
  const durationBase = 650;
  const pieces = [];
  for (let i = 0; i < coinsCount; i++) {
    const c = document.createElement('div');
    c.className = 'coin-fly pop';
    const jitter = () => (Math.random() - 0.5) * 36;
    const x0 = sx + jitter();
    const y0 = sy + jitter();
    c.style.left = x0 + 'px';
    c.style.top = y0 + 'px';
    coinLayer.appendChild(c);
    pieces.push({
      el: c,
      x0,
      y0
    });
  }
  const start = performance.now();
  const duration = durationBase + Math.random() * 120;
  return new Promise((resolve) => {

    function raf(now) {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      pieces.forEach((pc, idx) => {
        const wobble = Math.sin((p * 10) + idx) * (1 - p) * 10;
        const arc = -Math.sin(p * Math.PI) * (40 + (idx % 5) * 6);
        const x = pc.x0 + (tx - pc.x0) * ease + wobble;
        const y = pc.y0 + (ty - pc.y0) * ease + arc;
        const scale = 1 - p * 0.35;
        pc.el.style.transform = `translate3d(${x - pc.x0}px, ${y - pc.y0}px, 0) scale(${scale})`;
        pc.el.style.opacity = String(1 - p * 0.15);
      });
      if (p < 1) requestAnimationFrame(raf);
      else {
        pieces.forEach(pc => pc.el.remove());
        resolve();
      }
    }
    requestAnimationFrame(raf);
  });
}
