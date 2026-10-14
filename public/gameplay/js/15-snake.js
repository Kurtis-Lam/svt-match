// ── snakeventeen ──────────────────────────────────────────────
const SNK = GAME_CONFIG.games.snakeventeen;
const SNAKE_STATE = {
  gridSize: 10,
  snake: [],
  direction: 'right',
  food: {
    x: 0,
    y: 0,
    idolKey: '',
    imgSrc: ''
  },
  headIdolKey: '',
  gameTimer: null,
  timeLeft: SNK.timeLimitSec,
  score: 0,
  gameOver: false,
  lastMoveTime: 0,
  moveInterval: SNK.moveIntervalMs,
  touchStart: null,
  dirQueue: [],
  headDir: 'right',
  turn: 0,
  swipeBound: false,
  clockTimer: null,
  lastMoveDir: 'right',
  cells: null,
  cellKinds: null,
  cellsBound: false,
};

function confirmExitsnakeventeen() {
  if (GAME_STATE.battles?.active) {
    showToast("Cannot quit a battle", "error");
    return;
  }
  // Pause game while modal is open (optional)
  clearInterval(SNAKE_STATE.gameTimer);
  stopSnakeClock();
  SNAKE_STATE._timerPausedAt = SNAKE_STATE.timeLeft;
  openUndismissibleModal('Exit snakeventeen?', `
    <div class="glass-card rounded-2xl p-4 space-y-2">
        <p class="text-sm text-gray-700 font-semibold">If you exit now:</p>
        <ul class="text-xs text-gray-600 font-bold list-disc pl-5 space-y-1">
            <li>Your current snakeventeen streak will be lost.</li>
            <li>No coins will be earned.</li>
        </ul>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-2">
        <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900"
            onclick="resumesnakeventeenAfterCancel()">Keep Playing</button>
        <button class="btn-confirm-no"
            onclick="finalExitsnakeventeen()">Exit</button>
    </div>
  `);
}

function resumesnakeventeenAfterCancel() {
  closeModal();
  SNAKE_STATE.gameOver = false;
  SNAKE_STATE.timeLeft = SNAKE_STATE._timerPausedAt ?? SNK.timeLimitSec;
  document.getElementById('snakeTimer').textContent = String(SNAKE_STATE.timeLeft);
  clearInterval(SNAKE_STATE.gameTimer);
  SNAKE_STATE.gameTimer = setInterval(moveSnake, SNAKE_STATE.moveInterval);
  startSnakeClock();
}

function stopSnakeClock() {
  if (SNAKE_STATE.clockTimer) {
    clearInterval(SNAKE_STATE.clockTimer);
    SNAKE_STATE.clockTimer = null;
  }
}

function finalExitsnakeventeen() {
  closeModal();
  // ✅ RESET snakeventeen STREAK
  GAME_STATE.snakeventeenStreak = 0;
  __blockSavesUntil = 0;
  savePlayerState();
  const streakEl = document.getElementById('snakeventeenStreakCount');
  if (streakEl) streakEl.textContent = '0';
  // Now fully exit the game
  clearInterval(SNAKE_STATE.gameTimer);
  stopSnakeClock();
  SNAKE_STATE.gameOver = true;
  showScreen('hubScreen');
  renderHub();
}

function preloadsnakeventeenAssets() {
  const urls = [];
  // All 1.jpg images of every idol (including kkuma if present)
  Object.keys(IDOL_IMAGES).forEach(idolKey => {
    urls.push(`./imgs/${idolKey}/1.jpg`);
  });
  // Important: also preload a few food images (the gameplay uses idol 1.jpg as food)
  // Actually the food is already covered by others.
  // We'll ensure everything is loaded.
  lowPriorityPreload(urls);
  return Promise.resolve();
}

function opensnakeventeen(battleSpec = null) {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  preloadsnakeventeenAssets();
  initsnakeventeen(battleSpec);
  showScreen('snakeScreen');
  startSnakeCountdown();
}

function initsnakeventeen(battleSpec = null) {
  SNAKE_STATE.snake = [];
  SNAKE_STATE.direction = 'right';
  SNAKE_STATE.lastMoveDir = 'right';
  SNAKE_STATE.headDir = 'right';
  SNAKE_STATE.dirQueue = [];
  SNAKE_STATE.turn = 0;
  SNAKE_STATE.gameOver = false;
  SNAKE_STATE.score = 0;
  stopSnakeClock();
  clearInterval(SNAKE_STATE.gameTimer);
  SNAKE_STATE.timeLeft = SNK.timeLimitSec;
  SNAKE_STATE.foodSchedule = (battleSpec && battleSpec.foodSchedule) ? battleSpec.foodSchedule : null;
  SNAKE_STATE.nextFoodIdx = 0;
  document.getElementById('snakeLengthDisplay').textContent = String(SNK.startLength);
  document.getElementById('snakeTimer').textContent = String(SNK.timeLimitSec);
  // Determine head idol: use battle spec if provided, otherwise pick randomly
  let headIdol;
  if (battleSpec && battleSpec.headIdolKey) {
    const idol = IDOLS.find(i => i.key === battleSpec.headIdolKey);
    headIdol = idol || pickIdolsForLevel(1)[0];
  } else {
    headIdol = pickIdolsForLevel(1)[0];
  }
  SNAKE_STATE.headIdolKey = headIdol.key;
  const themePair = IDOL_THEME[SNAKE_STATE.headIdolKey] || ["#f5c6d0", "#9ec5d9"];
  const snakeScreen = document.getElementById('snakeScreen');
  if (snakeScreen) {
    snakeScreen.style.background = `linear-gradient(135deg, ${themePair[0]}, ${themePair[1]})`;
  }
  const startX = Math.floor(SNAKE_STATE.gridSize / 2);
  const startY = startX;
  SNAKE_STATE.snake = Array.from({ length: SNK.startLength }, (_, i) => ({ x: startX - i, y: startY }));
  placeSnakeFood();
  renderSnakeGrid();
  document.getElementById('snakeUpBtn').onclick = () => changeSnakeDirection('up');
  document.getElementById('snakeDownBtn').onclick = () => changeSnakeDirection('down');
  document.getElementById('snakeLeftBtn').onclick = () => changeSnakeDirection('left');
  document.getElementById('snakeRightBtn').onclick = () => changeSnakeDirection('right');
  bindSnakeSwipe();
}

function startSnakeCountdown() {
  const cd = document.getElementById('snakeCountdown');
  const main = document.querySelector('#snakeScreen > div:not(#snakeCountdown)');
  if (!cd || !main) return;
  cd.style.display = 'flex';
  main.style.display = 'none';
  let n = 3;
  const numEl = document.getElementById('snakeCountdownNum');
  numEl.textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n > 0) numEl.textContent = n;
    else {
      clearInterval(iv);
      cd.style.display = 'none';
      main.style.display = 'flex';
      startSnakeGame();
    }
  }, 850);
}

function startSnakeGame() {
  const backBtn = document.querySelector('#snakeScreen button i.fa-arrow-left')?.parentElement;
  if (backBtn && GAME_STATE.battles?.active) {
    backBtn.style.display = 'none';
  }
  SNAKE_STATE.lastMoveTime = performance.now();
  if (SNAKE_STATE.gameTimer) clearInterval(SNAKE_STATE.gameTimer);
  SNAKE_STATE.gameTimer = setInterval(moveSnake, SNAKE_STATE.moveInterval);
  startSnakeClock();
}

function startSnakeClock() {
  stopSnakeClock();
  SNAKE_STATE.clockTimer = setInterval(() => {
    if (SNAKE_STATE.gameOver) {
      stopSnakeClock();
      return;
    }
    SNAKE_STATE.timeLeft--;
    document.getElementById('snakeTimer').textContent = SNAKE_STATE.timeLeft;
    // —— Battle schedule: spawn food at prescribed times ——
    if (SNAKE_STATE.foodSchedule && SNAKE_STATE.nextFoodIdx < SNAKE_STATE.foodSchedule.length) {
      const elapsed = SNK.timeLimitSec - SNAKE_STATE.timeLeft;
      const nextScheduled = SNAKE_STATE.foodSchedule[SNAKE_STATE.nextFoodIdx];
      if (elapsed >= nextScheduled.appearAtSec) {
        SNAKE_STATE.food = {
          x: Math.floor(Math.random() * SNAKE_STATE.gridSize),
          y: Math.floor(Math.random() * SNAKE_STATE.gridSize),
          idolKey: nextScheduled.idolKey,
          imgSrc: nextScheduled.imgSrc
        };
        renderSnakeGrid();
        SNAKE_STATE.nextFoodIdx++;
      }
    }
    if (SNAKE_STATE.timeLeft <= 0) {
      stopSnakeClock();
      endSnakeGame();
    }
  }, 1000);
}

function moveSnake() {
  if (SNAKE_STATE.gameOver) return;
  const head = SNAKE_STATE.snake[0];
  if (SNAKE_STATE.dirQueue.length) SNAKE_STATE.direction = SNAKE_STATE.dirQueue.shift();
  SNAKE_STATE.turn = snakeTurnSign(SNAKE_STATE.lastMoveDir, SNAKE_STATE.direction);
  SNAKE_STATE.lastMoveDir = SNAKE_STATE.direction;
  let newHead = {
    x: head.x,
    y: head.y
  };
  switch (SNAKE_STATE.direction) {
    case 'right':
      newHead.x++;
      break;
    case 'left':
      newHead.x--;
      break;
    case 'down':
      newHead.y++;
      break;
    case 'up':
      newHead.y--;
      break;
  }
  if (newHead.x < 0 || newHead.x >= SNAKE_STATE.gridSize || newHead.y < 0 || newHead.y >= SNAKE_STATE.gridSize) {
    SNAKE_STATE.gameOver = true;
    endSnakeGame();
    return;
  }
  const willCollide = SNAKE_STATE.snake.some((seg, idx) => idx !== SNAKE_STATE.snake.length - 1 && seg.x === newHead.x && seg.y === newHead.y);
  if (willCollide) {
    SNAKE_STATE.gameOver = true;
    endSnakeGame();
    return;
  }
  const ate = (newHead.x === SNAKE_STATE.food.x && newHead.y === SNAKE_STATE.food.y);
  if (ate) {
    SNAKE_STATE.score++;
    SNAKE_STATE.snake.unshift(newHead);
    document.getElementById('snakeLengthDisplay').textContent = SNAKE_STATE.snake.length;
    showSnakePlus50();
    placeSnakeFood();
  } else {
    SNAKE_STATE.snake.unshift(newHead);
    SNAKE_STATE.snake.pop();
  }
  renderSnakeGrid();
}

function placeSnakeFood() {
  if (SNAKE_STATE.foodSchedule && SNAKE_STATE.nextFoodIdx < SNAKE_STATE.foodSchedule.length) {
    // food will be placed by the schedule; don’t generate random ones
    return;
  }
  const occupied = new Set(SNAKE_STATE.snake.map(s => `${s.x},${s.y}`));
  let x, y;
  do {
    x = Math.floor(Math.random() * SNAKE_STATE.gridSize);
    y = Math.floor(Math.random() * SNAKE_STATE.gridSize);
  } while (occupied.has(`${x},${y}`));
  const chosen = pickIdolsForLevel(1)[0];
  SNAKE_STATE.food = {
    x,
    y,
    idolKey: chosen.key,
    imgSrc: `./imgs/${chosen.key}/1.jpg`
  };
}

function ensureSnakeCells() {
  const grid = document.getElementById('snakeGrid');
  const n = SNAKE_STATE.gridSize * SNAKE_STATE.gridSize;
  if (SNAKE_STATE.cells && SNAKE_STATE.cells.length === n && grid.children.length === n) return;
  grid.textContent = '';
  const frag = document.createDocumentFragment();
  const cells = [];
  for (let i = 0; i < n; i++) {
    const cell = document.createElement('div');
    cell.className = 'sn-cell';
    const tile = document.createElement('div');
    tile.className = 'sn-tile';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    tile.appendChild(img);
    cell.appendChild(tile);
    frag.appendChild(cell);
    cells.push(cell);
  }
  grid.appendChild(frag);
  SNAKE_STATE.cells = cells;
  SNAKE_STATE.cellKinds = new Array(n).fill('');
  SNAKE_STATE.cellSrc = new Array(n).fill('');
}

const SNAKE_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// +1 = clockwise turn, -1 = counter-clockwise, 0 = straight
function snakeTurnSign(from, to) {
  if (!from || !to || from === to) return 0;
  const a = SNAKE_VEC[from], b = SNAKE_VEC[to];
  const cross = a[0] * b[1] - a[1] * b[0];
  return cross > 0 ? 1 : cross < 0 ? -1 : 0;
}

function snakeSide(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  return dx > 0 ? 'R' : dx < 0 ? 'L' : dy > 0 ? 'B' : 'T';
}

// Diff-based: each tile's look is a "signature" (kind + which sides join the next segment + head facing + turn).
// Only cells whose signature changed are touched (no innerHTML rebuild per tick).
function renderSnakeGrid() {
  ensureSnakeCells();
  const size = SNAKE_STATE.gridSize;
  const total = size * size;
  const want = new Array(total).fill('');
  const cls = new Array(total).fill('sn-cell');
  const src = new Array(total).fill('');
  const f = SNAKE_STATE.food;
  if (f && f.imgSrc) {
    const fi = f.y * size + f.x;
    want[fi] = 'food';
    cls[fi] = 'sn-cell sn-food';
    src[fi] = f.imgSrc;
  }
  const bodySrc = `./imgs/${SNAKE_STATE.headIdolKey}/1.jpg`;
  const snake = SNAKE_STATE.snake;
  for (let k = 0; k < snake.length; k++) {
    const idx = snake[k].y * size + snake[k].x;
    if (idx < 0 || idx >= total) continue;
    const joins = [];
    if (k > 0) joins.push(snakeSide(snake[k], snake[k - 1]));
    if (k < snake.length - 1) joins.push(snakeSide(snake[k], snake[k + 1]));
    let c = 'sn-cell sn-body ' + joins.map(j => 'j' + j).join(' ');
    if (k === 0) {
      const facing = snake.length > 1 ? (() => {
        const s = snakeSide(snake[1], snake[0]);
        return s === 'R' ? 'right' : s === 'L' ? 'left' : s === 'B' ? 'down' : 'up';
      })() : SNAKE_STATE.direction;
      SNAKE_STATE.headDir = facing;
      c += ' sn-head hd-' + facing;
      if (SNAKE_STATE.turn) c += SNAKE_STATE.turn > 0 ? ' tn-cw' : ' tn-ccw';
    } else if (k === snake.length - 1) {
      c += ' sn-tail';
    }
    want[idx] = c;
    cls[idx] = c;
    src[idx] = bodySrc;
  }
  SNAKE_STATE.turn = 0;
  const cells = SNAKE_STATE.cells, kinds = SNAKE_STATE.cellKinds, srcs = SNAKE_STATE.cellSrc;
  for (let i = 0; i < total; i++) {
    if (kinds[i] !== want[i]) {
      cells[i].className = cls[i];
      kinds[i] = want[i];
    }
    if (want[i] && srcs[i] !== src[i]) {
      cells[i].firstChild.firstChild.src = src[i];
      srcs[i] = src[i];
    }
  }
}

function changeSnakeDirection(dir) {
  const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (SNAKE_STATE.gameOver) return;
  const q = SNAKE_STATE.dirQueue;
  const ref = q.length ? q[q.length - 1] : SNAKE_STATE.lastMoveDir;
  if (dir === ref || opposites[dir] === ref) return;
  if (q.length >= 2) return;
  q.push(dir); // applied on the next tick, so two quick swipes both register
}

// Swipe anywhere on the screen. Direction fires as soon as the finger travels far enough,
// then the origin resets so chained swipes work without lifting the finger.
function bindSnakeSwipe() {
  if (SNAKE_STATE.swipeBound) return;
  const scr = document.getElementById('snakeScreen');
  if (!scr) return;
  SNAKE_STATE.swipeBound = true;
  const THRESH = 22;
  let ox = 0, oy = 0, active = false;
  const live = () => !scr.classList.contains('hidden') && !SNAKE_STATE.gameOver;
  const start = (x, y) => { ox = x; oy = y; active = true; };
  const move = (x, y) => {
    if (!active || !live()) return;
    const dx = x - ox, dy = y - oy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < THRESH) return;
    changeSnakeDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    ox = x; oy = y;
  };
  scr.addEventListener('touchstart', e => { if (e.touches[0]) start(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  scr.addEventListener('touchmove', e => {
    if (!live()) return;
    if (e.cancelable) e.preventDefault();
    if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  scr.addEventListener('touchend', () => { active = false; }, { passive: true });
  scr.addEventListener('touchcancel', () => { active = false; }, { passive: true });
  scr.addEventListener('mousedown', e => start(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', () => { active = false; });
}

function showSnakePlus50() {
  const parent = document.getElementById('snakeLengthDisplay').parentNode;
  const plus = document.createElement('span');
  plus.textContent = '+50';
  plus.style.cssText = 'position:absolute; top:-20px; right:0; font-weight:900; color:#16a34a; animation:slFly 0.9s ease forwards; z-index:200;';
  parent.appendChild(plus);
  setTimeout(() => plus.remove(), 950);
}

function openBattleSnakeResultModal(length) {
  openUndismissibleModal('Battle Completed!', `
    <div class="glass-card rounded-2xl p-4 text-center">
      <p class="text-sm text-gray-500 font-bold">Your Snake Length</p>
      <p class="text-3xl font-black text-gray-900">${length}</p>
    </div>
    <div class="grid grid-cols-1 gap-3 pt-2">
      <button class="btn-theme black-text" onclick="closeModal(); showScreen('hubScreen'); renderHub();">Back to Hub</button>
    </div>
  `);
}

function endSnakeGame() {
  const battleCtx = GAME_STATE.battles?.active;
  clearInterval(SNAKE_STATE.gameTimer);
  stopSnakeClock();
  SNAKE_STATE.gameOver = true;
  const length = SNAKE_STATE.snake.length;
  const passedSnake = SNAKE_STATE.score >= SNK.passIdolsEaten;
  if (battleCtx) {
    // Battle mode – no coins, no streak
    openBattleSnakeResultModal(length);
    finalizeSnakeBattle(length);
    GAME_STATE.battles.active = null;
  } else {
    // Normal game
    const coins = length * SNK.coinsPerLength;
    // PATCH BUG3: credit coins BEFORE daily-box/modal so balance is correct
    if (length >= SNK.streakLength) {
      GAME_STATE.snakeventeenStreak = (GAME_STATE.snakeventeenStreak || 0) + 1;
      if ((GAME_STATE.stats.snakeventeenBestStreak || 0) < GAME_STATE.snakeventeenStreak) {
        GAME_STATE.stats.snakeventeenBestStreak = GAME_STATE.snakeventeenStreak;
      }
    } else {
      GAME_STATE.snakeventeenStreak = 0;
    }
    const streakBonus = (GAME_STATE.snakeventeenStreak || 0) * SNK.streakBonusPerPoint;
    addCoinsToGame(coins + streakBonus, 'snakeventeen'); // PATCH BUG3: credited first
    if (passedSnake) {
      GAME_STATE.snakeventeenLevel = (GAME_STATE.snakeventeenLevel || 0) + 1;
      // L99: grant a daily box for completing a Snakeventeen level
      ensureDailyResetIfNeeded();
      const _snWins = GAME_STATE.daily.wins || 0;
      if (_snWins < 6) {
        GAME_STATE.daily.wins = _snWins + 1;
        if (isDailyBoxReady()) {
          // FIX BUG2: pre-resolve star + reward NOW (mirrors levelComplete path)
          let _snPreviewStar = 1;
          GAME_STATE.daily.box.star = 1;
          for (let _a = 0; _a < 4; _a++) {
            if (_snPreviewStar >= 5) break;
            const _p = STAR_UPGRADE_PROB[_snPreviewStar] || 0;
            if (Math.random() < _p) _snPreviewStar = Math.min(5, _snPreviewStar + 1);
          }
          GAME_STATE.daily.box.star = _snPreviewStar;
          const _snReward = resolveDailyBoxReward(_snPreviewStar);
          const _snBeforeCoins = GAME_STATE.coins;
          addCoinsToGame((_snReward.coins || 0), 'dailybox');
          markNextUnclaimedDailyWinCellClaimed();   // claim cell before any UI
          resetDailyBoxStarForNextClaim();
          GAME_STATE.daily.box.star = _snPreviewStar;
          updateDailySixBoxesUI();
          savePlayerState();
          // FIX BUG1: close result modal before launching fullscreen
          setTimeout(() => {
            closeModal();
            __dailyBoxAttempts = 4;
            __dailyBoxPhase = "upgrade";
            __dailyBoxPreResolved = {
              reward: _snReward,
              finalStar: _snPreviewStar,
              beforeCoins: _snBeforeCoins,
              // PATCH2c: re-open the Snakeventeen result modal after fullscreen closes
              onClose: (function(_c, _sb, _l, _ps) {
                return function() { openSnakeResultModal(_c, _sb, _l, _ps); };
              })(coins, streakBonus, length, passedSnake)
            };
            showDailyBoxFullscreen();
          }, 400);
        } else {
          updateDailySixBoxesUI();
        }
      }
    }
    if ((GAME_STATE.stats.snakeventeenLongestLength || 0) < length) {
      GAME_STATE.stats.snakeventeenLongestLength = length;
    }
    if (passedSnake) fireLevelSuccessBurst();
    try { Meta.onRunComplete('snakeventeen', { passed: passedSnake, elite: length >= SNK.streakLength, coins: coins + streakBonus, value: length }); } catch (e) { console.warn('[Meta]', e); }
    openSnakeResultModal(coins, streakBonus, length, passedSnake);
  }
  savePlayerState();
  renderHub();
}

function openSnakeResultModal(coins, streakBonus, length, passedLevel = false) {
  const total = coins + streakBonus;
  const title = passedLevel ? '✅ Level Complete!' : '❌ Level Failed';
  openUndismissibleModal(title, `
        <div class="glass-card rounded-2xl p-4 text-center">
          <p class="text-sm text-gray-500 font-bold">Length</p>
          <p class="text-3xl font-black text-gray-900">${length}</p>
        </div>
        <div class="earn-row">
          <div class="label">Length × ${SNK.coinsPerLength}</div>
          <div class="val">+${coins} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
        </div>
        ${streakBonus > 0 ? `` : ''}
        <div class="earn-row" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));border:none;">
          <div class="label font-black">Total</div>
          <div class="val font-black">+${total} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900"
            onclick="closeModal(); showScreen('hubScreen'); renderHub();">Back to Hub</button>
          <button class="btn-theme black-text"
       onclick="closeModal(); opensnakeventeen();">
       ${passedLevel ? 'Next Level' : 'Retry'}
    </button>
        </div>
  `);
}

async function finalizeSnakeBattle(length) {
  ensureBattlesDefaults();
  const ctx = GAME_STATE.battles.active;
  if (!ctx) return;
  const battleId = ctx.battleId;
  if (ctx.type === "friend") {
    const b = GAME_STATE.battles.pendingOutgoing.find(x => x.id === battleId);
    if (b) {
      b.fromLength = length;
      b.status = "waiting_opponent";
    }
    if (db && ctx.opponentUserId) {
      const ref = db.ref(`users/${ctx.opponentUserId}/playerState/battles/pendingIncoming`);
      const snap = await ref.once('value');
      const arr = snap.val() || [];
      const list = Array.isArray(arr) ? arr : Object.values(arr);
      list.forEach(x => {
        if (x.id === battleId) {
          x.fromLength = length;
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
  b.toLength = length;
  b.status = "completed";
  // SECURITY FIX [3]: validate score
  const myLen = _validateBattleScore('snakeventeen', length);
  const oppLen = Number(b.fromLength ?? 3);
  // Determine winner / tie from my perspective
  let youWin = false;
  let tie = false;
  if (myLen > oppLen) {
    youWin = true;
  } else if (myLen < oppLen) {
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
  // G-04: keep snakeventeenBestStreak in sync after battle outcome
  if ((GAME_STATE.snakeventeenStreak || 0) > (GAME_STATE.stats.snakeventeenBestStreak || 0)) {
    GAME_STATE.stats.snakeventeenBestStreak = GAME_STATE.snakeventeenStreak;
  }
  // Build meta objects (consistent naming)
  const myMeta = {
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
  // Log entry for myself
  const logId = `log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const logEntry = {
    game: 'snakeventeen',
    id: logId,
    completedAt: Date.now(),
    youLength: myLen,
    oppLength: oppLen,
    tie: tie,
    winnerLabel: tie ? "Tie" : (youWin ? "You" : (b.fromDisplayName || b.fromUsername)),
  };
  if (tie) {
    logEntry.player1 = myMeta;
    logEntry.player2 = oppMeta;
    logEntry.winner = null;
    logEntry.loser = null;
  } else {
    logEntry.winner = youWin ? myMeta : oppMeta;
    logEntry.loser = youWin ? oppMeta : myMeta;
  }
  GAME_STATE.battles.logs.push(logEntry);
  GAME_STATE.battles.pendingIncoming = GAME_STATE.battles.pendingIncoming.filter(x => x.id !== b.id);
  if (db) {
    // Save my own pendingIncoming + logs
    await db.ref(`users/${currentUser.id}/playerState/battles/pendingIncoming`).set(GAME_STATE.battles.pendingIncoming);
    await db.ref(`users/${currentUser.id}/playerState/battles/logs`).set(GAME_STATE.battles.logs);
    // Attempt to load opponent's real avatar
    try {
      const oppSnap2 = await db.ref(`users/${b.fromUserId}/playerState`).once('value').catch(() => null);
      const oppPS2 = oppSnap2?.val() || {};
      if (oppPS2.equippedIdolKey) oppMeta.avatarSrc = `./imgs/${oppPS2.equippedIdolKey}/1.jpg`;
    } catch (e) {}
    // Build mirrored log entry for opponent
    const oppRef = db.ref(`users/${b.fromUserId}/playerState`);
    const oppSnap = await oppRef.once('value');
    const oppPS = oppSnap.val() || {};
    oppPS.battles ||= {
      pendingIncoming: [],
      pendingOutgoing: [],
      logs: [],
      seenLogIds: {}
    };
    oppPS.battles.logs = oppPS.battles.logs || [];
    // Determine winner from opponent's perspective
    const oppWin = oppLen > myLen;
    const oppTie = oppLen === myLen;
    const oppLogId = `log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const oppLogEntry = {
      game: 'snakeventeen',
      id: oppLogId,
      completedAt: Date.now(),
      title: `Battle vs ${myMeta?.displayName || 'Opponent'}`,
      youLength: oppLen,
      oppLength: myLen,
      tie: oppTie,
      winnerLabel: oppTie ? "Tie" : (oppWin ? (oppMeta?.displayName || 'Opponent') : (myMeta?.displayName || 'You')),  // B-03 FIX
    };
    if (oppTie) {
      oppLogEntry.player1 = oppMeta;
      oppLogEntry.player2 = myMeta;
      oppLogEntry.winner = null;
      oppLogEntry.loser = null;
    } else {
      oppLogEntry.winner = oppWin ? oppMeta : myMeta;
      oppLogEntry.loser = oppWin ? myMeta : oppMeta;
    }
    oppPS.battles.logs.push(oppLogEntry);
    // Remove the outgoing battle from opponent
    oppPS.battles.pendingOutgoing = (oppPS.battles.pendingOutgoing || []).filter(x => x.id !== b.id);
    // SECURITY FIX [4]: Surgical update — never overwrite full playerState.
    const _snOppUpdates = {};
    _snOppUpdates[`users/${b.fromUserId}/playerState/battles/logs`]          = oppPS.battles.logs;
    _snOppUpdates[`users/${b.fromUserId}/playerState/battles/pendingOutgoing`] = oppPS.battles.pendingOutgoing;
    if (!oppTie) {
      const _snWinKey = oppWin ? 'battleWins' : 'battleLosses';
      _snOppUpdates[`users/${b.fromUserId}/playerState/stats/${_snWinKey}`] =
        (oppPS.stats?.[_snWinKey] || 0) + 1;
    }
    await db.ref().update(_snOppUpdates);
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