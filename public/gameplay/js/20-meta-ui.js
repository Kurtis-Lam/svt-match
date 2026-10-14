/* Season Pass UI and idol mastery. */
(function () {
  const D = META;
  let TAB = 'pass';
  const $ = id => document.getElementById(id);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const coinImg = '<img src="./imgs/assets/coins.png" alt="" class="ss-coin" />';
  const diamondImg = '<span aria-label="diamonds">💎</span>';
  const passConfig = GAME_CONFIG.seasonPass;

  function rewardText(reward) {
    if (!reward) return 'Reward';
    if (reward.type === 'box') return '🎁 SVT Box';
    if (reward.type === 'diamonds') return `${diamondImg} ${Number(reward.amount || 0).toLocaleString()} Diamonds`;
    return `${coinImg} ${Number(reward.amount || 0).toLocaleString()} Coins`;
  }

  function rewardResultText(given) {
    if (!given) return '';
    if (given.type === 'box') return `★${given.boxStar} SVT Box opened: +${Number(given.amount || 0).toLocaleString()} coins`;
    if (given.type === 'diamonds') return `+${Number(given.amount || 0).toLocaleString()} diamonds`;
    return `+${Number(given.amount || 0).toLocaleString()} coins`;
  }

  function updateHubCard() {
    const host = $('seasonHubCard');
    if (!host || !GAME_STATE) return;
    Meta.ensure();
    const p = Meta.passInfo();
    const ready = Meta.claimablePassLevels().length;
    host.innerHTML = `
      <button class="ss-hub-card" onclick="openSeason()" aria-label="Open Season Pass">
        <div class="ss-hub-row">
          <span class="ss-hub-title">Season Pass</span>
          <span class="ss-hub-left">${p.level}/${passConfig.maxLevel} levels</span>
        </div>
        <div class="ss-bar"><i style="width:${p.pct}%"></i></div>
        <div class="ss-hub-row ss-hub-sub">
          <span><b>${p.xp.toLocaleString()}</b> XP earned</span>
          <span>${p.max ? 'Pass completed' : `${p.current.toLocaleString()} / ${p.need.toLocaleString()} XP`}</span>
        </div>
        ${ready ? `<span class="ss-ready">${ready} reward${ready > 1 ? 's' : ''} ready</span>` : ''}
      </button>`;
  }

  window.openSeason = function (tab) {
    if (!currentUser) { showToast('Not logged in', 'error'); return; }
    Meta.ensure();
    if (tab) TAB = tab;
    renderSeason();
    showScreen('seasonScreen');
  };
  window.closeSeason = function () { showScreen('hubScreen'); renderHub(); };
  window.setSeasonTab = function (tab) { TAB = tab === 'idols' ? 'idols' : 'pass'; renderSeason(); };

  window.claimSeasonTier = function (index) {
    const given = Meta.claimPassLevel(Number(index));
    if (!given) { showToast('That reward is locked or already claimed.', 'info'); return; }
    showToast(`Level ${Number(index) + 1} reward: ${rewardResultText(given)}`, 'success');
    renderHub();
    renderSeason();
  };

  function renderSeason() {
    const body = $('ssBody');
    if (!body) return;
    Meta.ensure();
    const p = Meta.passInfo();
    const title = $('ssTitle');
    if (title) title.textContent = 'Season Pass';
    const tabs = [['pass', 'Pass'], ['idols', 'Idol Mastery']].map(([key, label]) =>
      `<button class="ss-tab ${TAB === key ? 'on' : ''}" onclick="setSeasonTab('${key}')">${label}${key === 'pass' && Meta.claimablePassLevels().length ? '<em></em>' : ''}</button>`
    ).join('');
    const nextLevel = p.max ? null : p.level + 1;
    body.innerHTML = `
      <div class="ss-banner">
        <div class="ss-banner-top">
          <div><div class="ss-eyebrow">17-Level Progression</div><div class="ss-big">${p.level}<small> / ${passConfig.maxLevel}</small></div></div>
          <div class="ss-right"><div class="ss-tier">${p.max ? 'Completed' : `Level ${p.level}`}</div><div class="ss-left">${p.xp.toLocaleString()} total XP</div></div>
        </div>
        <div class="ss-bar ss-bar-lg"><i style="width:${p.pct}%"></i></div>
        <div class="ss-banner-sub">${p.max ? 'You have completed every Season Pass level.' : `${Math.max(0, p.need - p.current).toLocaleString()} XP to reach Level ${nextLevel}`}</div>
      </div>
      <div class="ss-tabs">${tabs}</div>
      <div id="ssPane"></div>`;
    const pane = $('ssPane');
    if (TAB === 'idols') pane.innerHTML = idolsHtml();
    else pane.innerHTML = passHtml(p);
  }

  function passHtml(p) {
    const rows = passConfig.levels.map((level, i) => {
      const number = i + 1;
      const reached = p.level >= number;
      const claimed = !!p.claimed[i];
      const cumulative = Meta.passThreshold(number);
      const action = claimed
        ? '<span class="ss-done">✓ Claimed</span>'
        : reached
          ? `<button class="ss-claim" onclick="claimSeasonTier(${i})">Claim</button>`
          : `<span class="ss-lock">${Math.max(0, cumulative - p.xp).toLocaleString()} XP to go</span>`;
      return `<div class="ss-row ${reached ? 'reached' : ''} ${claimed ? 'claimed' : ''}">
        <div class="ss-num">${number}</div>
        <div class="ss-mid"><div class="ss-name">Level ${number}</div><div class="ss-sub">${cumulative.toLocaleString()} total XP · ${rewardText(level.reward)}</div></div>
        <div class="ss-act">${action}</div>
      </div>`;
    }).join('');
    return `<div class="ss-list">${rows}</div><p class="ss-note">Finish Showtime, Spotlight, Snakeventeen, and Choreo Echo runs to earn Season Pass XP. XP requirements increase every level. SVT Box rewards use the same star-upgrade odds and coin rewards as the Daily Box.</p>`;
  }

  function idolsHtml() {
    const owned = Meta.ownedKeys(), lead = Meta.leadKey(), fp = Meta.fandomPower();
    const bonus = Math.round(Meta.coinBonusPct() * 1000) / 10;
    const head = `<div class="ss-card ss-fandom">
      <div><div class="ss-eyebrow">Fandom Power</div><div class="ss-big">${fp.toLocaleString()}</div></div>
      <div class="ss-fandom-r"><b>+${bonus}%</b> coins on every run${lead ? `<br>Lead: ${esc(Meta.idolName(lead))}` : '<br>Marry an idol and equip it as your theme to set a Lead'}</div>
    </div>`;
    if (!owned.length) return head + `<div class="ss-card">You don't own any idols yet. Unlock idols with Diamonds in the Idols screen, then play to level up their Mastery.</div>`;
    const rows = owned.slice().sort((a, b) => Meta.xpOf(b) - Meta.xpOf(a)).map(k => {
      const p = Meta.progress(k);
      return `<div class="ss-row">
        <img class="ss-av" src="./imgs/${esc(k)}/1.jpg" alt="" loading="lazy" decoding="async" />
        <div class="ss-mid"><div class="ss-name">${esc(Meta.idolName(k))}${k === lead ? ' <span class="ss-lead">LEAD</span>' : ''}</div>
          <div class="ss-bar ss-bar-sm"><i style="width:${p.pct}%"></i></div>
          <div class="ss-sub">${p.max ? 'MAX' : `${p.cur.toLocaleString()} / ${p.need.toLocaleString()} XP`}</div></div>
        <div class="ss-act"><span class="ss-lv">Lv.${p.lv}</span></div></div>`;
    }).join('');
    const missing = IDOLS.length - owned.length;
    return head + `<div class="ss-list">${rows}</div>` + (missing > 0 ? `<p class="ss-note">${missing} idol${missing > 1 ? 's' : ''} remaining. Each collected idol adds Fandom Power and can earn Mastery XP during runs.</p>` : '');
  }

  Meta.ui = { refresh() { updateHubCard(); const scr = $('seasonScreen'); if (scr && !scr.classList.contains('hidden')) renderSeason(); }, updateHubCard };
  const previousRenderHub = renderHub;
  renderHub = function () { previousRenderHub(); try { updateHubCard(); } catch (e) {} };
  document.addEventListener('DOMContentLoaded', () => { try { updateHubCard(); } catch (e) {} });
})();
