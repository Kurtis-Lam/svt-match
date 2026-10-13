/* ──────────────────────────────────────────────────────────────────────────
   META LOOP — UI: hub card + Season screen (Track · Goals · Ladder · Idols)
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  const D = META;
  let TAB = 'track';
  let LADDER_SCOPE = 'global';
  let _ladderToken = 0;
  let _clock = null;

  const $ = id => document.getElementById(id);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const coinImg = '<img src="./imgs/assets/coins.png" alt="" class="ss-coin" />';

  function rewardChips(r) {
    const c = [];
    if (r.coins) c.push(`<span class="ss-chip">${coinImg}${r.coins}</span>`);
    if (r.rings) c.push(`<span class="ss-chip">💍 ${r.rings}</span>`);
    if (r.xp) c.push(`<span class="ss-chip">⭐ ${r.xp} XP</span>`);
    return c.join('');
  }

  // ── Hub card ──────────────────────────────────────────────────────────────
  function updateHubCard() {
    const host = $('seasonHubCard');
    if (!host || !GAME_STATE || !GAME_STATE.meta) return;
    const info = Meta.seasonInfo(), s = Meta.state().season;
    const t = Meta.tierOf(s.sp), next = D.TIERS[t];
    const lo = t > 0 ? D.TIERS[t - 1].sp : 0;
    const pct = next ? Math.max(0, Math.min(100, Math.round(((s.sp - lo) / (next.sp - lo)) * 100))) : 100;
    const ready = Meta.claimableCount();
    host.innerHTML = `
      <button class="ss-hub-card" onclick="openSeason()" aria-label="Open Season">
        <div class="ss-hub-row">
          <span class="ss-hub-title">Season ${info.num} · ${esc(info.name)}</span>
          <span class="ss-hub-left">${Meta.fmtLeft(info.endMs - Date.now())} left</span>
        </div>
        <div class="ss-bar"><i style="width:${pct}%"></i></div>
        <div class="ss-hub-row ss-hub-sub">
          <span><b>${s.sp}</b> SP · ${esc(Meta.tierName(t))}</span>
          <span>${next ? `Next: ${esc(next.name)} at ${next.sp}` : 'Max tier reached'}</span>
        </div>
        ${ready ? `<span class="ss-ready">${ready} reward${ready > 1 ? 's' : ''} ready</span>` : ''}
      </button>`;
  }

  // ── Screen ────────────────────────────────────────────────────────────────
  window.openSeason = function (tab) {
    if (!currentUser) { showToast('Not logged in', 'error'); return; }
    Meta.ensure(); Meta.tick(); Meta.syncBattles();
    if (tab) TAB = tab;
    renderSeason();
    showScreen('seasonScreen');
    clearInterval(_clock);
    _clock = setInterval(() => { // keep the countdown live only while the screen is open
      const scr = $('seasonScreen');
      if (!scr || scr.classList.contains('hidden')) { clearInterval(_clock); return; }
      const el = $('ssLeft'); if (el) el.textContent = Meta.fmtLeft(Meta.seasonInfo().endMs - Date.now()) + ' left';
    }, 30000);
  };
  window.closeSeason = function () { clearInterval(_clock); showScreen('hubScreen'); renderHub(); };
  window.setSeasonTab = function (t) { TAB = t; renderSeason(); };
  window.setLadderScope = function (s) { LADDER_SCOPE = s; renderSeason(); };

  window.claimSeasonTier = function (i) {
    const g = Meta.claimTier(i);
    if (!g) return;
    const bits = [];
    if (g.coins) bits.push(`+${g.coins} coins`);
    if (g.rings) bits.push(`+${g.rings} ring`);
    if (g.xp) bits.push(`+${g.xp} ${g.xpIdol ? Meta.idolName(g.xpIdol) + ' ' : ''}XP`);
    showToast(`${D.TIERS[i].name} reward: ${bits.join(' · ')}`, 'success');
    renderHub(); renderSeason();
  };
  window.claimSeasonGoal = function (id) {
    const sp = Meta.claimGoal(id);
    if (!sp) return;
    showToast(`Goal complete! +${sp} SP`, 'success');
    renderSeason();
  };

  function renderSeason() {
    const body = $('ssBody'); if (!body) return;
    Meta.ensure();
    const info = Meta.seasonInfo(), s = Meta.state().season;
    const t = Meta.tierOf(s.sp), next = D.TIERS[t], lo = t > 0 ? D.TIERS[t - 1].sp : 0;
    const pct = next ? Math.max(0, Math.min(100, Math.round(((s.sp - lo) / (next.sp - lo)) * 100))) : 100;
    const title = $('ssTitle'); if (title) title.textContent = `Season ${info.num}`;
    const last = Meta.state().last;

    const tabs = [['track', 'Track'], ['goals', 'Goals'], ['ladder', 'Ladder'], ['idols', 'Idols']]
      .map(([k, l]) => `<button class="ss-tab ${TAB === k ? 'on' : ''}" onclick="setSeasonTab('${k}')">${l}${k === 'track' && Meta.claimableTiers().length ? '<em></em>' : ''}${k === 'goals' && Meta.claimableGoals().length ? '<em></em>' : ''}</button>`).join('');

    body.innerHTML = `
      <div class="ss-banner">
        <div class="ss-banner-top">
          <div><div class="ss-eyebrow">${esc(info.name)}</div><div class="ss-big">${s.sp} <small>SP</small></div></div>
          <div class="ss-right"><div class="ss-tier">${esc(Meta.tierName(t))}</div><div class="ss-left" id="ssLeft">${Meta.fmtLeft(info.endMs - Date.now())} left</div></div>
        </div>
        <div class="ss-bar ss-bar-lg"><i style="width:${pct}%"></i></div>
        <div class="ss-banner-sub">${next ? `${next.sp - s.sp} SP to <b>${esc(next.name)}</b>` : 'You reached the top tier — Legend!'}</div>
        ${last ? `<div class="ss-last">Last season: ${esc(Meta.tierName(last.tier))} · ${last.sp} SP</div>` : ''}
      </div>
      <div class="ss-tabs">${tabs}</div>
      <div id="ssPane"></div>`;

    const pane = $('ssPane');
    if (TAB === 'track') pane.innerHTML = trackHtml();
    else if (TAB === 'goals') pane.innerHTML = goalsHtml();
    else if (TAB === 'idols') pane.innerHTML = idolsHtml();
    else ladderInto(pane);
  }

  function trackHtml() {
    const s = Meta.state().season;
    return `<div class="ss-list">` + D.TIERS.map((tr, i) => {
      const reached = s.sp >= tr.sp, claimed = !!s.claimed['t' + i];
      const action = claimed ? `<span class="ss-done">✓ Claimed</span>`
        : reached ? `<button class="ss-claim" onclick="claimSeasonTier(${i})">Claim</button>`
        : `<span class="ss-lock">${tr.sp - s.sp} SP to go</span>`;
      return `<div class="ss-row ${reached ? 'reached' : ''} ${claimed ? 'claimed' : ''}">
        <div class="ss-num">${i + 1}</div>
        <div class="ss-mid"><div class="ss-name">${esc(tr.name)}</div><div class="ss-sub">${tr.sp} SP · ${rewardChips(tr.reward)}</div></div>
        <div class="ss-act">${action}</div></div>`;
    }).join('') + `</div>
    <p class="ss-note">Season Points come from every Showtime, Spotlight and Snakeventeen run, plus friend battles (win +${D.SP.win}, tie +${D.SP.tie}, loss +${D.SP.loss}). After ${D.SP.fullRunsPerDay} runs a day, extra runs are worth ${D.SP.overflow} SP. Unclaimed rewards are paid automatically when the season ends.</p>`;
  }

  function goalsHtml() {
    const g = Meta.state().season.goals;
    const left = Math.max(0, D.SP.fullRunsPerDay - (Meta.state().season.day.runs || 0));
    const dayOk = Meta.state().season.day.key === ((typeof hkDayKey === 'function') ? hkDayKey() : '');
    return `<div class="ss-list">` + D.GOALS.map(def => {
      const v = Math.min(Meta.goalValue(def.id), def.target), done = Meta.goalDone(def), claimed = !!g.claimed[def.id];
      const act = claimed ? `<span class="ss-done">✓ Done</span>` : done ? `<button class="ss-claim" onclick="claimSeasonGoal('${def.id}')">+${def.sp} SP</button>` : `<span class="ss-lock">+${def.sp} SP</span>`;
      return `<div class="ss-row ${done ? 'reached' : ''} ${claimed ? 'claimed' : ''}">
        <div class="ss-mid"><div class="ss-name">${esc(def.label)}</div>
          <div class="ss-bar ss-bar-sm"><i style="width:${Math.round((v / def.target) * 100)}%"></i></div>
          <div class="ss-sub">${v} / ${def.target}</div></div>
        <div class="ss-act">${act}</div></div>`;
    }).join('') + `</div>
    <div class="ss-card"><b>Today:</b> ${dayOk ? left : D.SP.fullRunsPerDay} full-value run${(dayOk ? left : D.SP.fullRunsPerDay) === 1 ? '' : 's'} left (resets 00:00 HKT).</div>`;
  }

  function idolsHtml() {
    const owned = Meta.ownedKeys(), lead = Meta.leadKey(), fp = Meta.fandomPower();
    const bonus = Math.round(Meta.coinBonusPct() * 1000) / 10;
    const head = `<div class="ss-card ss-fandom">
      <div><div class="ss-eyebrow">Fandom Power</div><div class="ss-big">${fp}</div></div>
      <div class="ss-fandom-r"><b>+${bonus}%</b> coins on every run${lead ? `<br>Lead: ${esc(Meta.idolName(lead))} (+${Meta.leadSpBonus()} SP/run)` : '<br>Marry & equip an idol to set a Lead'}</div>
    </div>`;
    if (!owned.length) return head + `<div class="ss-card">You don't own any idols yet. Unlock idols in the Idols tab, then play to level them up — every idol in your runs earns Mastery XP.</div>`;
    const rows = owned.slice().sort((a, b) => Meta.xpOf(b) - Meta.xpOf(a)).map(k => {
      const p = Meta.progress(k);
      return `<div class="ss-row">
        <img class="ss-av" src="./imgs/${esc(k)}/1.jpg" alt="" loading="lazy" decoding="async" />
        <div class="ss-mid"><div class="ss-name">${esc(Meta.idolName(k))}${k === lead ? ' <span class="ss-lead">LEAD</span>' : ''}</div>
          <div class="ss-bar ss-bar-sm"><i style="width:${p.pct}%"></i></div>
          <div class="ss-sub">${p.max ? 'MAX' : `${p.cur} / ${p.need} XP`}</div></div>
        <div class="ss-act"><span class="ss-lv">Lv.${p.lv}</span></div></div>`;
    }).join('');
    const missing = IDOLS.length - owned.length;
    return head + `<div class="ss-list">${rows}</div>` +
      (missing > 0 ? `<p class="ss-note">${missing} idol${missing > 1 ? 's' : ''} still to collect — each new idol adds Fandom Power and earns XP whenever it shows up in your runs.</p>` : '');
  }

  function ladderInto(pane) {
    const seg = `<div class="ss-seg"><button class="${LADDER_SCOPE === 'global' ? 'on' : ''}" onclick="setLadderScope('global')">Global</button><button class="${LADDER_SCOPE === 'friends' ? 'on' : ''}" onclick="setLadderScope('friends')">Friends</button></div>`;
    pane.innerHTML = seg + `<div class="ss-list" id="ssLadder"><div class="ss-card">Loading…</div></div>`;
    const token = ++_ladderToken;
    Meta.fetchLadder(LADDER_SCOPE).then(res => {
      if (token !== _ladderToken || TAB !== 'ladder') return;
      const host = $('ssLadder'); if (!host) return;
      let html = res.rows.map((r, i) => `<div class="ss-row ${r.me ? 'me' : ''}">
        <div class="ss-num">${i + 1}</div>
        <img class="ss-av" src="${esc(Meta.safeAvatar(r.a))}" alt="" loading="lazy" decoding="async" />
        <div class="ss-mid"><div class="ss-name">${esc(r.n)}${r.me ? ' <span class="ss-lead">YOU</span>' : ''}</div><div class="ss-sub">${esc(Meta.tierName(r.t))}</div></div>
        <div class="ss-act"><b>${r.sp}</b> <small>SP</small></div></div>`).join('');
      if (res.error === 'denied') html += `<div class="ss-card">The shared ladder isn't enabled on the server yet, so only your own score is shown. (Admin: see docs/DATABASE_RULES.md)</div>`;
      else if (res.error === 'offline') html += `<div class="ss-card">Ladders need an online account.</div>`;
      else if (LADDER_SCOPE === 'friends' && res.rows.length === 1) html += `<div class="ss-card">Add friends to compete with them every week.</div>`;
      host.innerHTML = html;
    });
  }

  // refresh whatever is visible
  Meta.ui = {
    refresh() {
      updateHubCard();
      const scr = $('seasonScreen');
      if (scr && !scr.classList.contains('hidden') && TAB !== 'ladder') renderSeason();
    },
    updateHubCard,
  };

  // keep the hub card in sync with every renderHub() (same wrapper pattern the game already uses)
  const _prevRenderHub = renderHub;
  renderHub = function () { _prevRenderHub(); try { updateHubCard(); } catch (e) {} };
})();
