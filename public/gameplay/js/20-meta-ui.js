/* META LOOP — SVT Pass interface and Idol Mastery. */
(function () {
  const D = META;
  let TAB = 'track';
  let _clock = null;
  const $ = id => document.getElementById(id);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const coinImg = '<img src="./imgs/assets/coins.png" alt="" class="ss-coin" />';
  const amount = n => Number(n || 0).toLocaleString();

  function rewardChips(r) {
    const c = [];
    if (r.coins) c.push(`<span class="ss-chip">${coinImg}${amount(r.coins)}</span>`);
    if (r.diamonds) c.push(`<span class="ss-chip">💎 ${amount(r.diamonds)}</span>`);
    if (r.boxes) c.push(`<span class="ss-chip">🎁 SVT Box ×${amount(r.boxes)}</span>`);
    if (r.rings) c.push(`<span class="ss-chip">💍 ${amount(r.rings)}</span>`);
    if (r.xp) c.push(`<span class="ss-chip">⭐ ${amount(r.xp)} Mastery XP</span>`);
    return c.join('');
  }

  function updateHubCard() {
    const host = $('seasonHubCard');
    if (!host || !GAME_STATE || !GAME_STATE.meta) return;
    const info = Meta.seasonInfo(), s = Meta.state().season;
    const t = Meta.tierOf(s.sp), next = D.TIERS[t];
    const lo = t > 0 ? D.TIERS[t - 1].sp : 0;
    const pct = next ? Math.max(0, Math.min(100, Math.round(((s.sp - lo) / Math.max(1, next.sp - lo)) * 100))) : 100;
    const ready = Meta.claimableCount();
    host.innerHTML = `
      <button class="ss-hub-card" onclick="openSeason()" aria-label="Open SVT Pass">
        <div class="ss-hub-row"><span class="ss-hub-title">SVT Pass · Season ${info.num}</span><span class="ss-hub-left">${Meta.fmtLeft(info.endMs - Date.now())} left</span></div>
        <div class="ss-bar"><i style="width:${pct}%"></i></div>
        <div class="ss-hub-row ss-hub-sub"><span><b>${amount(s.sp)}</b> Season XP · ${esc(Meta.tierName(t))}</span><span>${next ? `Next: ${esc(next.name)} at ${amount(next.sp)} XP` : 'All 17 levels completed'}</span></div>
        ${ready ? `<span class="ss-ready">${ready} reward${ready > 1 ? 's' : ''} ready</span>` : ''}
      </button>`;
  }

  window.openSeason = function (tab) {
    if (!currentUser) { showToast('Not logged in', 'error'); return; }
    Meta.ensure(); Meta.tick(); Meta.syncBattles();
    if (tab) TAB = tab;
    renderSeason();
    showScreen('seasonScreen');
    clearInterval(_clock);
    _clock = setInterval(() => {
      const scr = $('seasonScreen');
      if (!scr || scr.classList.contains('hidden')) { clearInterval(_clock); return; }
      const el = $('ssLeft');
      if (el) el.textContent = Meta.fmtLeft(Meta.seasonInfo().endMs - Date.now()) + ' left';
    }, 30000);
  };
  window.closeSeason = function () { clearInterval(_clock); showScreen('hubScreen'); renderHub(); };
  window.setSeasonTab = function (t) { TAB = ['track', 'goals', 'idols'].includes(t) ? t : 'track'; renderSeason(); };

  window.claimSeasonTier = function (i) {
    const g = Meta.claimTier(i);
    if (!g) return;
    const bits = [];
    if (g.coins) bits.push(`+${amount(g.coins)} coins`);
    if (g.diamonds) bits.push(`+${amount(g.diamonds)} diamonds`);
    if (g.boxes) bits.push(`+${amount(g.boxes)} SVT Box${g.boxes > 1 ? 'es' : ''}`);
    if (g.rings) bits.push(`+${amount(g.rings)} ring${g.rings > 1 ? 's' : ''}`);
    if (g.xp) bits.push(`+${amount(g.xp)} ${g.xpIdol ? Meta.idolName(g.xpIdol) + ' ' : ''}Mastery XP`);
    showToast(`${D.TIERS[i].name} reward: ${bits.join(' · ') || 'Claimed'}`, 'success');
    renderHub(); renderSeason();
  };
  window.claimSeasonGoal = function (id) {
    const xp = Meta.claimGoal(id);
    if (!xp) return;
    showToast(`Goal complete! +${amount(xp)} Season XP`, 'success');
    renderHub(); renderSeason();
  };

  window.openSeasonBox = async function () {
    Meta.ensure();
    const season = Meta.state().season;
    if (!season || Number(season.boxes || 0) < 1) { showToast('No SVT Boxes available', 'info'); return; }
    season.boxes = Math.max(0, Number(season.boxes) - 1);
    let finalStar = 1;
    for (let i = 0; i < 4; i++) {
      const chance = (GAME_CONFIG.dailyBox?.starUpgradeChance || {})[finalStar] || 0;
      if (finalStar < 5 && Math.random() < chance) finalStar++;
    }
    const reward = resolveDailyBoxReward(finalStar);
    const beforeCoins = GAME_STATE.coins;
    addCoinsToGame(reward.coins || 0, 'dailybox');
    GAME_STATE.daily.box.star = 1;
    __dailyBoxAttempts = 4;
    __dailyBoxPhase = 'upgrade';
    __dailyBoxPreResolved = {
      reward, finalStar, beforeCoins,
      onClose: () => { renderHub(); if (typeof renderSeason === 'function') renderSeason(); showScreen('seasonScreen'); }
    };
    await savePlayerState();
    renderSeason();
    showDailyBoxFullscreen();
  };

  function renderSeason() {
    const body = $('ssBody'); if (!body) return;
    Meta.ensure();
    const info = Meta.seasonInfo(), s = Meta.state().season;
    const t = Meta.tierOf(s.sp), next = D.TIERS[t], lo = t > 0 ? D.TIERS[t - 1].sp : 0;
    const pct = next ? Math.max(0, Math.min(100, Math.round(((s.sp - lo) / Math.max(1, next.sp - lo)) * 100))) : 100;
    const title = $('ssTitle'); if (title) title.textContent = `SVT Pass · Season ${info.num}`;
    const last = Meta.state().last;
    const tabs = [['track', 'Rewards'], ['goals', 'Missions'], ['idols', 'Idol Mastery']]
      .map(([k, label]) => `<button class="ss-tab ${TAB === k ? 'on' : ''}" onclick="setSeasonTab('${k}')">${label}${k === 'track' && Meta.claimableTiers().length ? '<em></em>' : ''}${k === 'goals' && Meta.claimableGoals().length ? '<em></em>' : ''}</button>`).join('');
    body.innerHTML = `
      <div class="ss-banner">
        <div class="ss-banner-top">
          <div><div class="ss-eyebrow">SVT PASS · SEASON ${info.num}</div><div class="ss-big">${amount(s.sp)} <small>XP</small></div></div>
          <div class="ss-right"><div class="ss-tier">Level ${Math.max(1, Math.min(D.TIERS.length, t || 1))} / 17</div><div class="ss-left" id="ssLeft">${Meta.fmtLeft(info.endMs - Date.now())} left</div></div>
        </div>
        <div class="ss-bar ss-bar-lg"><i style="width:${pct}%"></i></div>
        <div class="ss-banner-sub">${next ? `${amount(next.sp - s.sp)} XP to <b>${esc(next.name)}</b>` : 'All 17 levels completed!'}</div>
        ${Number(s.boxes || 0) > 0 ? `<button class="ss-claim" style="margin-top:10px" onclick="openSeasonBox()">Open SVT Box 🎁 · ${amount(s.boxes)} available</button>` : ''}
        ${last ? `<div class="ss-last">Last season: ${esc(Meta.tierName(last.tier))} · ${amount(last.sp)} XP</div>` : ''}
      </div>
      <div class="ss-tabs">${tabs}</div><div id="ssPane"></div>`;
    const pane = $('ssPane');
    if (TAB === 'track') pane.innerHTML = trackHtml();
    else if (TAB === 'goals') pane.innerHTML = goalsHtml();
    else pane.innerHTML = idolsHtml();
  }

  function trackHtml() {
    const s = Meta.state().season;
    return `<div class="ss-list">` + D.TIERS.map((tr, i) => {
      const reached = s.sp >= tr.sp, claimed = !!s.claimed['t' + i];
      const action = claimed ? `<span class="ss-done">✓ Claimed</span>`
        : reached ? `<button class="ss-claim" onclick="claimSeasonTier(${i})">Claim</button>`
        : `<span class="ss-lock">${amount(tr.sp - s.sp)} XP to go</span>`;
      return `<div class="ss-row ${reached ? 'reached' : ''} ${claimed ? 'claimed' : ''}">
        <div class="ss-num">${i + 1}</div><div class="ss-mid"><div class="ss-name">${esc(tr.name)}</div><div class="ss-sub">${amount(tr.sp)} XP · ${rewardChips(tr.reward)}</div></div><div class="ss-act">${action}</div></div>`;
    }).join('') + `</div>
    <p class="ss-note">Earn Season XP by completing Showtime, Spotlight, Snakeventeen and Choreo Echo runs, plus friend battles. After ${amount(D.SP.fullRunsPerDay)} runs a day, extra runs earn ${amount(D.SP.overflow)} XP. Unclaimed rewards are paid automatically when the season ends.</p>`;
  }

  function goalsHtml() {
    const g = Meta.state().season.goals;
    const left = Math.max(0, D.SP.fullRunsPerDay - (Meta.state().season.day.runs || 0));
    const dayOk = Meta.state().season.day.key === ((typeof hkDayKey === 'function') ? hkDayKey() : '');
    return `<div class="ss-list">` + D.GOALS.map(def => {
      const v = Math.min(Meta.goalValue(def.id), def.target), done = Meta.goalDone(def), claimed = !!g.claimed[def.id];
      const act = claimed ? `<span class="ss-done">✓ Claimed</span>` : done ? `<button class="ss-claim" onclick="claimSeasonGoal('${def.id}')">+${amount(def.sp)} XP</button>` : `<span class="ss-lock">+${amount(def.sp)} XP</span>`;
      return `<div class="ss-row ${done ? 'reached' : ''} ${claimed ? 'claimed' : ''}"><div class="ss-mid"><div class="ss-name">${esc(def.label)}</div><div class="ss-bar ss-bar-sm"><i style="width:${Math.round((v / def.target) * 100)}%"></i></div><div class="ss-sub">${amount(v)} / ${amount(def.target)}</div></div><div class="ss-act">${act}</div></div>`;
    }).join('') + `</div><div class="ss-card"><b>Today:</b> ${dayOk ? left : D.SP.fullRunsPerDay} full-value runs left (resets 00:00 HKT).</div>`;
  }

  function idolsHtml() {
    const owned = Meta.ownedKeys(), lead = Meta.leadKey(), fp = Meta.fandomPower();
    const bonus = Math.round(Meta.coinBonusPct() * 1000) / 10;
    const head = `<div class="ss-card ss-fandom"><div><div class="ss-eyebrow">Fandom Power</div><div class="ss-big">${amount(fp)}</div></div><div class="ss-fandom-r"><b>+${bonus}%</b> coins on every run${lead ? `<br>Lead: ${esc(Meta.idolName(lead))} (+${Meta.leadSpBonus()} XP/run)` : '<br>Marry & equip an idol to set a Lead'}</div></div>`;
    if (!owned.length) return head + `<div class="ss-card">You don't own any idols yet. Buy idols with diamonds in the Idols tab, then play to level up their Mastery.</div>`;
    const rows = owned.slice().sort((a, b) => Meta.xpOf(b) - Meta.xpOf(a)).map(k => {
      const p = Meta.progress(k);
      return `<div class="ss-row"><img class="ss-av" src="./imgs/${esc(k)}/1.jpg" alt="" loading="lazy" decoding="async" /><div class="ss-mid"><div class="ss-name">${esc(Meta.idolName(k))}${k === lead ? ' <span class="ss-lead">LEAD</span>' : ''}</div><div class="ss-bar ss-bar-sm"><i style="width:${p.pct}%"></i></div><div class="ss-sub">${p.max ? 'MAX' : `${amount(p.cur)} / ${amount(p.need)} XP`}</div></div><div class="ss-act"><span class="ss-lv">Lv.${p.lv}</span></div></div>`;
    }).join('');
    const missing = IDOLS.length - owned.length;
    return head + `<div class="ss-list">${rows}</div>` + (missing > 0 ? `<p class="ss-note">${missing} idols remain to collect. Each idol contributes to Fandom Power and earns Mastery XP during runs.</p>` : '');
  }

  Meta.ui = { refresh() { updateHubCard(); const scr = $('seasonScreen'); if (scr && !scr.classList.contains('hidden')) renderSeason(); }, updateHubCard };
  const _prevRenderHub = renderHub;
  renderHub = function () { _prevRenderHub(); try { updateHubCard(); } catch (e) {} };
})();
