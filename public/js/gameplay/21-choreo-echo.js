// File: public/js/gameplay/21-choreo-echo.js
/* ──────────────────────────────────────────────────────────────────────────
   CHOREO ECHO — 4th game mode (Simon-style idol sequence memory)
   Watch the idols light up, then repeat the choreography. Round N shows N steps.
   The first 9 steps are a shuffle of all 9 pads, so every idol is always used.

   Modes (names, rounds, rewards … all live in config.js → games.echo)
     Setlist ........ 9 rounds: 1 idol, then 2, … then all 9, then it ends
     Endless Encore . never ends; chase your best round (the leaderboard)

   Save data lives in GAME_STATE.meta.echo = { level, streak, bestStreak, bestRounds, bestEndless }
   Every run ends in Meta.onRunComplete('echo', …) like the other modes.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const G = GAME_CONFIG.games.echo;
  const CFG = {
    pads: G.pads,
    lives: G.lives,
    passRounds: G.passRounds,
    eliteRounds: G.streakRounds,
    coinsPerRound: G.coinsPerRound,
    perfectBonus: G.perfectBonus,
    streakBonus: G.streakBonusPerPoint,
    setRounds: G.modes.set.rounds,
  };

  const E = {
    pads: [],
    seq: [],
    inputIdx: 0,
    round: 0,
    cleared: 0,
    lives: CFG.lives,
    phase: 'idle',
    token: 0,
    mode: 'set',
    timers: new Set(),
    padEls: [],
    built: false,
  };

  const $ = id => document.getElementById(id);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── persistence helpers (stored under meta.echo) ──────────────────────────
  function st() {
    if (!GAME_STATE.meta || typeof GAME_STATE.meta !== 'object') GAME_STATE.meta = {};
    const m = GAME_STATE.meta;
    if (!m.echo || typeof m.echo !== 'object') m.echo = {};
    const e = m.echo;
    e.level = Math.max(0, Math.floor(Number(e.level) || 0));
    e.streak = Math.max(0, Math.floor(Number(e.streak) || 0));
    e.bestStreak = Math.max(0, Math.floor(Number(e.bestStreak) || 0));
    e.bestRounds = Math.max(0, Math.floor(Number(e.bestRounds) || 0));
    e.bestEndless = Math.max(0, Math.floor(Number(e.bestEndless) || 0));
    return e;
  }

  function buzz(p) {
    if (reduceMotion || document.hidden) return;
    try {
      if (localStorage.getItem('svt:haptics') === 'off') return;
    } catch (e) {}
    if (typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(p); } catch (e) {}
    }
  }

  // ── timers: everything is tracked so exit/restart can never leak callbacks ─
  function later(fn, ms) {
    const tok = E.token;
    const id = setTimeout(() => {
      E.timers.delete(id);
      if (tok !== E.token) return;
      fn();
    }, ms);
    E.timers.add(id);
    return id;
  }

  function clearTimers() {
    E.timers.forEach(clearTimeout);
    E.timers.clear();
  }

  // ── hub wiring ────────────────────────────────────────────────────────────
  function syncHub() {
    const s = st();
    const lv = $('echoLevelLabel');
    if (lv) lv.textContent = 'Lv. ' + s.level;
    const sk = $('echoStreakCount');
    if (sk) sk.textContent = String(s.streak);
  }

  const _renderHub = window.renderHub;
  if (typeof _renderHub === 'function') {
    window.renderHub = function () {
      const r = _renderHub.apply(this, arguments);
      try { syncHub(); } catch (e) {}
      return r;
    };
  }

  window.openEchoLevelInfo = function () {
    openModal('Choreo Echo Level', `
      <div class="glass-card rounded-2xl p-4 text-sm text-gray-700 font-semibold text-center">
        Advance to next level: <b>clear ${CFG.passRounds} rounds in one run</b> (either mode).
      </div>`);
  };

  window.openEchoStreakInfo = function () {
    openModal('ℹ️ Choreo Echo Streak', `
      <div class="glass-card rounded-2xl p-4 text-sm text-gray-700 font-semibold">
        Clear ${CFG.eliteRounds} rounds in a run to keep your streak alive. Every streak point adds
        +${CFG.streakBonus} coins to your run reward.
      </div>`);
  };

  // ── board ─────────────────────────────────────────────────────────────────
  function buildBoard() {
    const grid = $('echoGrid');
    if (!grid) return;
    if (!E.built) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < CFG.pads; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'echo-pad';
        b.dataset.i = String(i);
        b.setAttribute('aria-label', 'Idol pad ' + (i + 1));
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        b.appendChild(img);
        frag.appendChild(b);
        E.padEls.push(b);
      }
      grid.appendChild(frag);
      grid.addEventListener('pointerdown', onPadDown);
      E.built = true;
    }
    E.padEls.forEach((el, i) => {
      const key = E.pads[i];
      const img = el.firstChild;
      img.src = `/imgs/${key}/1.jpg`;
      const theme = (typeof IDOL_THEME !== 'undefined' && IDOL_THEME[key]) || ['#f5c6d0', '#9ec5d9'];
      el.style.setProperty('--glow', theme[0]);
      el.classList.remove('lit', 'wrong', 'right');
      el.disabled = true;
    });
  }

  function setPadsEnabled(on) {
    const grid = $('echoGrid');
    if (grid) grid.classList.toggle('echo-live', !!on);
    E.padEls.forEach(el => { el.disabled = !on; });
  }

  function flash(i, ms, cls) {
    const el = E.padEls[i];
    if (!el) return;
    cls = cls || 'lit';
    el.classList.add(cls);
    const tok = E.token;
    setTimeout(() => {
      if (tok === E.token) el.classList.remove(cls);
    }, ms);
  }

  function paintStatus(text, tone) {
    const s = $('echoStatus');
    if (!s) return;
    s.textContent = text;
    s.dataset.tone = tone || '';
  }

  function paintHud() {
    const r = $('echoRound');
    if (r) r.textContent = E.mode === 'set' ? Math.min(E.round, CFG.setRounds) + '/' + CFG.setRounds : String(E.round);
    const lab = $('echoRoundLabel');
    if (lab) lab.textContent = E.mode === 'set' ? 'ROUND' : '∞ ROUND';
    const l = $('echoLives');
    if (l) l.textContent = '❤'.repeat(Math.max(0, E.lives)) + '♡'.repeat(Math.max(0, CFG.lives - E.lives));
    const bar = $('echoProgress');
    if (bar) {
      const total = Math.max(1, E.seq.length);
      bar.style.setProperty('--p', Math.round((E.inputIdx / total) * 100) + '%');
    }
  }

  // ── flow ──────────────────────────────────────────────────────────────────
  // Mode picker shown before every run (called from the hub card)
  window.openEchoModes = function () {
    if (!currentUser) { showToast('Not logged in', 'error'); return; }
    if (GAME_STATE.battles && GAME_STATE.battles.active) { showToast('Finish your battle first', 'error'); return; }
    const s = st();
    const M = G.modes;
    openModal('Choreo Echo', `
      <p class="text-xs text-gray-500 font-bold text-center">Pick a mode</p>
      <button class="echo-mode-card" onclick="closeModal(); openEcho('set')">
        <span class="echo-mode-ico">🎤</span>
        <span class="echo-mode-txt"><b>${M.set.name}</b><small>${M.set.blurb}</small></span>
        <span class="echo-mode-tag">${CFG.setRounds} rounds</span>
      </button>
      <button class="echo-mode-card" onclick="closeModal(); openEcho('endless')">
        <span class="echo-mode-ico">♾️</span>
        <span class="echo-mode-txt"><b>${M.endless.name}</b><small>${M.endless.blurb}</small><small style="color:#be185d;">(doesn't count towards streak)</small></span>
        <span class="echo-mode-tag">Best ${s.bestEndless}</span>
      </button>`);
  };

  window.openEcho = function (mode) {
    if (mode !== 'set' && mode !== 'endless') { openEchoModes(); return; }
    if (!currentUser) { showToast('Not logged in', 'error'); return; }
    if (GAME_STATE.battles && GAME_STATE.battles.active) { showToast('Finish your battle first', 'error'); return; }
    E.token++;
    clearTimers();
    E.mode = mode;
    E._finishing = false;
    E.pads = pickIdolsForLevel(CFG.pads).map(i => i.key);
    // The first 9 steps are a shuffle of ALL pads, so every idol is used; endless continues randomly after that.
    E.order = shuffled(Array.from({ length: CFG.pads }, (_, i) => i));
    E.seq = [];
    E.round = 0;
    E.cleared = 0;
    E.lives = CFG.lives;
    E.inputIdx = 0;
    E.phase = 'idle';
    const scr = $('echoScreen');
    if (scr) {
      const theme = (typeof IDOL_THEME !== 'undefined' && IDOL_THEME[E.pads[0]]) || ['#f5c6d0', '#9ec5d9'];
      scr.style.background = `linear-gradient(135deg, ${theme[0]}, ${theme[1]})`;
    }
    buildBoard();
    if (typeof lowPriorityPreload === 'function') {
      lowPriorityPreload(E.pads.map(k => `/imgs/${k}/1.jpg`));
    }
    showScreen('echoScreen');
    paintHud();
    countdown();
  };

  function countdown() {
    const cd = $('echoCountdown');
    const num = $('echoCountdownNum');
    if (!cd || !num) { nextRound(); return; }
    cd.classList.add('show');
    let n = 3;
    num.textContent = n;
    const tick = () => {
      n--;
      if (n > 0) {
        num.textContent = n;
        later(tick, 700);
      } else {
        cd.classList.remove('show');
        nextRound();
      }
    };
    later(tick, 700);
  }

  function nextRound() {
    E.round++;
    while (E.seq.length < E.round) {
      const L = E.seq.length;
      let n;
      if (L < CFG.pads) n = E.order[L];
      else {
        n = Math.floor(Math.random() * CFG.pads);
        // avoid 3 identical steps in a row — keeps sequences readable
        if (L >= 2 && E.seq[L - 1] === n && E.seq[L - 2] === n) n = (n + 1 + Math.floor(Math.random() * (CFG.pads - 1))) % CFG.pads;
      }
      E.seq.push(n);
    }
    playSequence();
  }

  function stepMs() {
    // Round 25 is the hard ceiling for speed: rounds 26+ use the exact same
    // interval as round 25 instead of making the flashes progressively faster.
    const cappedRound = Math.min(25, Math.max(1, Number(E.round) || 1));
    const round25Cap = G.stepStartMs - (cappedRound - 1) * G.stepSpeedupMs;
    return Math.max(Number(G.stepMinMs) || 0, round25Cap);
  }

  function playSequence() {
    E.phase = 'show';
    E.inputIdx = 0;
    setPadsEnabled(false);
    paintHud();
    paintStatus('Watch the choreo…', 'watch');
    const step = stepMs();
    let t = 650;
    E.seq.forEach((padIdx, k) => {
      later(() => { flash(padIdx, Math.round(step * 0.72)); buzz(8); }, t);
      t += step;
    });
    later(() => {
      E.phase = 'input';
      setPadsEnabled(true);
      paintStatus('Your turn!', 'go');
      paintHud();
    }, t + 120);
  }

  function onPadDown(e) {
    const el = e.target.closest && e.target.closest('.echo-pad');
    if (!el || E.phase !== 'input' || el.disabled) return;
    e.preventDefault();
    const i = Number(el.dataset.i);
    const want = E.seq[E.inputIdx];
    if (i === want) {
      flash(i, 220, 'right');
      buzz(10);
      E.inputIdx++;
      paintHud();
      if (E.inputIdx >= E.seq.length) roundCleared();
    } else {
      flash(i, 420, 'wrong');
      flash(want, 520, 'lit');
      buzz([30, 40, 30]);
      mistake();
    }
  }

  function roundCleared() {
    E.phase = 'between';
    E.cleared++;
    setPadsEnabled(false);
    const setDone = E.mode === 'set' && E.cleared >= CFG.setRounds;
    paintStatus(setDone ? 'Full setlist! 🎉' : 'Nice! Next round…', 'ok');
    if (setDone) {
      later(finish, 700);
    } else {
      later(nextRound, 800);
    }
  }

  function mistake() {
    E.phase = 'between';
    E.lives--;
    setPadsEnabled(false);
    paintHud();
    if (E.lives <= 0) {
      paintStatus('Out of lives', 'bad');
      later(finish, 900);
    } else {
      paintStatus('Oops! Watch again…', 'bad');
      later(playSequence, 1000);
    }
  }

  // ── exit ──────────────────────────────────────────────────────────────────
  window.confirmExitEcho = function () {
    if (E.phase === 'over') { leave(); return; }
    openUndismissibleModal('Exit Choreo Echo?', `
      <div class="glass-card rounded-2xl p-4 space-y-2">
        <p class="text-sm text-gray-700 font-semibold">If you exit now:</p>
        <ul class="text-xs text-gray-600 font-bold list-disc pl-5 space-y-1">
          <li>Your Choreo Echo streak will be lost.</li>
          <li>No coins will be earned.</li>
        </ul>
      </div>
      <div class="grid grid-cols-2 gap-3 pt-2">
        <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Keep Playing</button>
        <button class="btn-confirm-no" onclick="finalExitEcho()">Exit</button>
      </div>`);
  };

  window.finalExitEcho = function () {
    closeModal();
    st().streak = 0;
    leave();
    try { savePlayerState(); } catch (e) {}
  };

  function leave() {
    E.token++;
    clearTimers();
    E.phase = 'over';
    const cd = $('echoCountdown');
    if (cd) cd.classList.remove('show');
    showScreen('hubScreen');
    renderHub();
  }

  // ── results ───────────────────────────────────────────────────────────────
  async function finish() {
    if (E._finishing) return;
    E._finishing = true;
    E.phase = 'over';
    setPadsEnabled(false);
    const s = st();
    const rounds = E.cleared;
    const passed = rounds >= CFG.passRounds;
    const elite = rounds >= CFG.eliteRounds;
    const perfect = E.mode === 'set' && E.lives === CFG.lives && rounds >= CFG.setRounds;

    if (E.mode === 'endless') {
      // endless runs never change the streak
    } else if (elite) {
      s.streak++;
      if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    } else {
      s.streak = 0;
    }
    if (rounds > s.bestRounds) s.bestRounds = rounds;
    const newBest = E.mode === 'endless' && rounds > s.bestEndless;
    if (E.mode === 'endless') {
      s.bestEndless = Math.max(s.bestEndless, rounds);
      // Save the record before the server award transaction so it cannot be overwritten
      // by an award based on an older player-state snapshot. Re-save even for an existing
      // best so records retained locally from an earlier failed save are synced to the server.
      try { await savePlayerState(); } catch (e) { console.warn('[Echo] Could not save Endless record before award:', e); }
      try { if (typeof invalidateLeaderboardCache === 'function') invalidateLeaderboardCache(); } catch (e) {}
    }

    // Coins and the echo level are awarded by the server (api/_lib/awards.js).
    const award = await claimAwardSafe('echo', {
      rounds,
      mode: E.mode,
      perfect,
      fandomPct: svtFandomPct(),
      leadBonus: svtLeadBonus()
    });
    const ex = (award && award.extra) || {};
    const base = Number(ex.base) || 0;
    const streakBonus = Number(ex.streakBonus) || 0;
    const total = Number(ex.runCoins) || 0;
    if (passed && typeof fireLevelSuccessBurst === 'function') fireLevelSuccessBurst();

    try {
      const seasonXpGained = Number(Meta.onRunComplete('echo', { passed, elite, coins: total, fandomCoins: Number(ex.fandomCoins) || 0, keys: E.pads.slice(), value: rounds })) || 0;
      GAME_STATE.meta ||= {};
      GAME_STATE.meta.lastRunXpGained = seasonXpGained;
    } catch (e) { console.warn('[Meta]', e); }

    const show = () => openResult(rounds, base, streakBonus, passed, perfect, newBest);

    if (passed) grantDailyBox(show); else show();

    try { await savePlayerState(); } catch (e) { console.warn('[Echo] Could not save run result:', e); }
    if (E.mode === 'endless') {
      try { if (typeof invalidateLeaderboardCache === 'function') invalidateLeaderboardCache(); } catch (e) {}
    }
    renderHub();
  }

  // Same daily-box reward flow as the other modes (one box per passed level)
  async function grantDailyBox(after) {
    try {
      ensureDailyResetIfNeeded();
      const wins = GAME_STATE.daily.wins || 0;
      if (wins >= 6) { after(); return; }
      GAME_STATE.daily.wins = wins + 1;
      if (!isDailyBoxReady()) { updateDailySixBoxesUI(); after(); return; }

      const box = await svtOpenDailyBoxServer('daily');
      if (!box) { after(); return; }
      const star = box.star;
      GAME_STATE.daily.box.star = star;
      const reward = box.reward;
      const beforeCoins = box.beforeCoins;
      markNextUnclaimedDailyWinCellClaimed();
      resetDailyBoxStarForNextClaim();
      GAME_STATE.daily.box.star = star;
      updateDailySixBoxesUI();
      savePlayerState();
      setTimeout(() => {
        closeModal();
        __dailyBoxAttempts = 4;
        __dailyBoxPhase = 'upgrade';
        __dailyBoxPreResolved = { reward, finalStar: star, beforeCoins, onClose: after };
        showDailyBoxFullscreen();
      }, 400);
    } catch (e) {
      console.warn('[Echo] daily box', e);
      after();
    }
  }

  function openResult(rounds, base, streakBonus, passed, perfect, newBest) {
    const s = st();
    const coin = '<img src="/imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;" alt="">';
    openUndismissibleModal(passed ? '✅ Level Complete!' : '❌ Level Failed', `
      <div class="glass-card rounded-2xl p-4 text-center">
        <p class="text-sm text-gray-500 font-bold">Rounds cleared</p>
        <p class="text-3xl font-black text-gray-900">${rounds}${E.mode === 'set' ? `<span class="text-base text-gray-400">/${CFG.setRounds}</span>` : ''}</p>
        <p class="text-[11px] text-gray-500 font-extrabold mt-1">${G.modes[E.mode].name}</p>
        ${perfect ? '<p class="text-xs font-black text-amber-500 mt-1">PERFECT RUN · no lives lost</p>' : ''}
        ${newBest ? '<p class="text-xs font-black text-pink-500 mt-1">NEW ENDLESS RECORD! 🏆</p>' : ''}
        <p class="text-[11px] text-gray-400 font-bold mt-1">${E.mode === 'endless' ? `Endless best: ${s.bestEndless}` : `Best: ${s.bestRounds}`} rounds</p>
      </div>
      <div class="earn-row"><div class="label">Rounds × ${CFG.coinsPerRound}${perfect ? ' + perfect' : ''}</div><div class="val">+${Number(base).toLocaleString()} ${coin}</div></div>
      ${streakBonus > 0 ? `<div class="earn-row"><div class="label">Streak 🔥 ${s.streak}</div><div class="val">+${Number(streakBonus).toLocaleString()} ${coin}</div></div>` : ''}
      <div class="earn-row" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));border:none;">
        <div class="label font-black">Total</div>
        <div class="val font-black">+${Number(base + streakBonus).toLocaleString()} ${coin}</div>
      </div>
      <div class="earn-row"><div class="label">Season XP</div><div class="val">+${Number(GAME_STATE.meta?.lastRunXpGained || 0).toLocaleString()} XP</div></div>
      <div class="grid grid-cols-2 gap-3">
        <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900" onclick="closeModal(); showScreen('hubScreen'); renderHub();">Back to Hub</button>
        <button class="btn-theme black-text" onclick="closeModal(); openEcho('${E.mode}');">${passed ? 'Next Level' : 'Retry'}</button>
      </div>`);
  }

  // first paint of the hub card once persistence has loaded
  document.addEventListener('DOMContentLoaded', () => { try { syncHub(); } catch (e) {} });
})();