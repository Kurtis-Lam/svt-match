// File: public/js/gameplay/20-meta-ui.js
/* SVT Pass interface: a compact pass card, XP missions, and a claimable reward-track popup. */
(function () {
  const D = META;
  let _clock = null;
  const $ = id => document.getElementById(id);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const amount = n => Number(n || 0).toLocaleString();
  const oneDay = 24 * 60 * 60 * 1000;

  function passProgress(s) {
    const level = Math.max(1, Math.min(D.TIERS.length, Meta.tierOf(s.sp) || 1));
    const thisTier = D.TIERS[level - 1] || D.TIERS[0];
    const nextTier = D.TIERS[level] || null;
    const start = Number(thisTier?.sp) || 0;
    const need = nextTier ? Math.max(1, nextTier.sp - start) : 0;
    const current = nextTier ? Math.max(0, Math.min(need, s.sp - start)) : Math.max(0, s.sp - start);
    const pct = nextTier ? Math.max(0, Math.min(100, Math.round((current / need) * 100))) : 100;
    return { level, current, need, pct, nextTier };
  }

  function timeLeftHtml(info) {
    const left = info.endMs - Date.now();
    return `<span class="ss-hub-left ${left < oneDay ? 'is-urgent' : ''}">${esc(Meta.fmtLeft(left))} left</span>`;
  }

  function updateHubCard() {
    const host = $('seasonHubCard');
    if (!host || !GAME_STATE || !GAME_STATE.meta) return;
    Meta.ensure();
    Meta.tick();
    if (typeof Meta.flushPendingSeasonMeta === 'function') Meta.flushPendingSeasonMeta();
    const info = Meta.seasonInfo();
    const s = Meta.state().season;
    const progress = passProgress(s);
    const ready = Meta.claimableCount();
    host.innerHTML = `
      <button class="ss-hub-card" type="button" onclick="openSeason()" aria-label="Open SVT Pass, Level ${progress.level}">
        <div class="ss-hub-row"><span class="ss-hub-title">SVT Pass · Season ${info.num}</span>${timeLeftHtml(info)}</div>
        <div class="ss-hub-main">
          <span class="ss-hub-level-icon" aria-hidden="true">${progress.level}</span>
          <span class="ss-hub-progress">
            <span class="ss-hub-level-label">Level ${progress.level}</span>
            <span class="ss-bar"><i style="width:${progress.pct}%"></i></span>
            <span class="ss-hub-xp">XP: ${amount(progress.current)}/${progress.need ? amount(progress.need) : amount(progress.current)}</span>
          </span>
        </div>
        ${ready ? `<span class="ss-ready">${ready} reward${ready > 1 ? 's' : ''} ready</span>` : ''}
      </button>`;
  }

  window.openSeason = function () {
    if (!currentUser) { showToast('Not logged in', 'error'); return; }
    Meta.ensure(); Meta.tick(); Meta.syncBattles();
    renderSeason();
    showScreen('seasonScreen');
    clearInterval(_clock);
    _clock = setInterval(() => {
      const scr = $('seasonScreen');
      if (!scr || scr.classList.contains('hidden')) { clearInterval(_clock); return; }
      const info = Meta.seasonInfo();
      const left = info.endMs - Date.now();
      const el = $('ssLeft');
      if (el) {
        el.textContent = `${Meta.fmtLeft(left)} left`;
        el.classList.toggle('is-urgent', left < oneDay);
      }
      const hubLeft = $('seasonHubCard')?.querySelector('.ss-hub-left');
      if (hubLeft) {
        hubLeft.textContent = `${Meta.fmtLeft(left)} left`;
        hubLeft.classList.toggle('is-urgent', left < oneDay);
      }
    }, 30000);
  };

  window.closeSeason = function () {
    clearInterval(_clock);
    if (window.RewardPopups) RewardPopups.close();
    showScreen('hubScreen');
    renderHub();
  };

  window.claimSeasonTier = async function (i) {
    const g = await Meta.claimTier(i);
    if (!g) return;
    const bits = [];
    if (g.coins) bits.push(`+${amount(g.coins)} coins`);
    if (g.diamonds) bits.push(`+${amount(g.diamonds)} diamonds`);
    if (g.boxes) bits.push(`+${amount(g.boxes)} SVT Box${g.boxes > 1 ? 'es' : ''}`);
    if (g.rings) bits.push(`+${amount(g.rings)} ring${g.rings > 1 ? 's' : ''}`);
    if (g.xp) bits.push(`+${amount(g.xp)} ${g.xpIdol ? Meta.idolName(g.xpIdol) + ' ' : ''}Mastery XP`);
    showToast(`${D.TIERS[i].name} reward: ${bits.join(' · ') || 'Claimed'}`, 'success');
    renderHub();
    renderSeason();
    openSeasonRewards();
  };

  window.claimSeasonGoal = function (id) {
    const xp = Meta.claimGoal(id);
    if (!xp) return;
    renderHub();
    renderSeason();
    if (window.RewardPopups) {
      RewardPopups.show({
        type: 'svtPassMission',
        title: 'Mission Reward',
        description: 'Your Season XP has been added to the pass.',
        icon: '⭐',
        amount: xp,
        rewardLabel: 'Season XP',
        onAction: () => {}
      });
    } else {
      showToast(`Goal complete! +${amount(xp)} Season XP`, 'success');
    }
  };

  window.openSeasonBox = async function () {
    Meta.ensure();
    const season = Meta.state().season;
    if (!season || Number(season.boxes || 0) < 1) { showToast('No SVT Boxes available', 'info'); return; }
    const box = await svtOpenDailyBoxServer('season');
    if (!box) { showToast('Could not open the box right now', 'error'); return; }
    season.boxes = Math.max(0, Number(season.boxes) - 1);
    const finalStar = box.star;
    const reward = box.reward;
    const beforeCoins = box.beforeCoins;
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
    const body = $('ssBody');
    if (!body) return;
    Meta.ensure();
    const info = Meta.seasonInfo();
    const s = Meta.state().season;
    const progress = passProgress(s);
    const left = info.endMs - Date.now();
    const xpBottom = `${amount(progress.current)}/${progress.need ? amount(progress.need) : amount(progress.current)}`;
    const title = $('ssTitle');
    if (title) title.textContent = `SVT Pass · Season ${info.num}`;
    body.innerHTML = `
      <button class="ss-banner ss-banner-button" type="button" onclick="openSeasonRewards()" aria-label="Open SVT Pass rewards and claim unlocked levels">
        <div class="ss-banner-top">
          <span class="ss-level-block">
            <span class="ss-level-emblem">${progress.level}</span>
            <span class="ss-level-label">Level ${progress.level}</span>
          </span>
          <span class="ss-left ${left < oneDay ? 'is-urgent' : ''}" id="ssLeft">${esc(Meta.fmtLeft(left))} left</span>
        </div>
        <div class="ss-bar ss-bar-lg"><i style="width:${progress.pct}%"></i></div>
        <div class="ss-banner-sub">XP: ${xpBottom}</div>
        <div class="ss-banner-hint"><span>🎁</span> Tap to view and claim level rewards</div>
      </button>
      <section class="ss-missions">
        <div class="ss-section-heading">Missions to earn XP</div>
        ${goalsHtml()}
      </section>`;
  }

  function rewardIcons(reward) {
    const icons = [];
    if (reward.coins) icons.push('🪙');
    if (reward.diamonds) icons.push('💎');
    if (reward.boxes) icons.push('🎁');
    if (reward.rings) icons.push('💍');
    if (reward.xp) icons.push('⭐');
    return icons.length ? icons : ['🎁'];
  }

  function rewardDescription(reward) {
    const bits = [];
    if (reward.coins) bits.push(`${amount(reward.coins)} coins`);
    if (reward.diamonds) bits.push(`${amount(reward.diamonds)} diamonds`);
    if (reward.boxes) bits.push(`${amount(reward.boxes)} SVT Box${reward.boxes > 1 ? 'es' : ''}`);
    if (reward.rings) bits.push(`${amount(reward.rings)} rings`);
    if (reward.xp) bits.push(`${amount(reward.xp)} Mastery XP`);
    return bits.join(' · ') || 'Reward';
  }

  window.openSeasonRewards = function () {
    Meta.ensure();
    const s = Meta.state().season;
    const progress = passProgress(s);
    const rows = D.TIERS.map((tier, index) => {
      const level = index + 1;
      const reached = s.sp >= tier.sp;
      const claimed = !!s.claimed['t' + index];
      const current = level === progress.level;
      const icons = rewardIcons(tier.reward).map(icon => `<span>${icon}</span>`).join('');
      const detail = rewardDescription(tier.reward);
      const button = claimed
        ? `<button type="button" class="reward-track-icon is-claimed" disabled aria-label="Level ${level} reward already claimed"><span>✓</span><span class="reward-track-icon-label">Claimed</span></button>`
        : reached
          ? `<button type="button" class="reward-track-icon is-claimable" onclick="claimSeasonTier(${index})" aria-label="Claim Level ${level} reward" title="Claim Level ${level} reward"><span class="reward-track-icons">${icons}</span><span class="reward-track-icon-label">Claim</span></button>`
          : `<button type="button" class="reward-track-icon" disabled aria-label="Level ${level} reward locked"><span>🔒</span><span class="reward-track-icon-label">Locked</span></button>`;
      const tag = claimed ? 'Claimed' : reached ? (current ? 'Current level · Ready to claim' : 'Ready to claim') : `${amount(Math.max(0, tier.sp - s.sp))} XP to unlock`;
      return `<article class="reward-track-row ${current ? 'is-current' : ''} ${claimed ? 'is-claimed' : ''} ${!reached ? 'is-locked' : ''}" data-level="${level}">
        <span class="reward-track-node">${level}</span>
        <span class="reward-track-main"><span class="reward-track-name">Level ${level}</span><span class="reward-track-detail">${amount(tier.sp)} XP · ${esc(detail)}</span><span class="reward-track-tag">${esc(tag)}</span></span>
        ${button}
      </article>`;
    }).join('');
    if (window.RewardPopups) {
      RewardPopups.showTrack({
        type: 'svtPass',
        title: `Season ${Meta.seasonInfo().num} Rewards`,
        description: 'Tap the reward icon on an unlocked level to claim it. Claimed rewards are greyed out.',
        bodyHtml: `<div class="reward-track-list">${rows}</div>`,
        currentLevel: progress.level,
        xpText: amount(s.sp),
        claimedText: `${Meta.claimableCount() ? `${Meta.claimableCount()} rewards ready` : 'All caught up'}`
      });
    }
  };

  function goalsHtml() {
    const s = Meta.state().season;
    return `<div class="ss-list">` + D.GOALS.map(def => {
      const value = Math.min(Meta.goalValue(def.id), def.target);
      const done = Meta.goalDone(def);
      const claimed = !!s.goals.claimed[def.id];
      const action = claimed
        ? `<span class="ss-done">✓ Claimed</span>`
        : done
          ? `<button type="button" class="ss-claim" onclick="claimSeasonGoal('${esc(def.id)}')">Claim +${amount(def.sp)} XP</button>`
          : `<span class="ss-lock">+${amount(def.sp)} XP</span>`;
      return `<div class="ss-row ${done ? 'reached' : ''} ${claimed ? 'claimed' : ''}">
        <div class="ss-mid"><div class="ss-name">${esc(def.label)}</div><div class="ss-bar ss-bar-sm"><i style="width:${Math.round((value / def.target) * 100)}%"></i></div><div class="ss-sub">${amount(value)} / ${amount(def.target)}</div></div>
        <div class="ss-act">${action}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  Meta.ui = { refresh() { updateHubCard(); const scr = $('seasonScreen'); if (scr && !scr.classList.contains('hidden')) renderSeason(); }, updateHubCard };
  const _prevRenderHub = renderHub;
  renderHub = function () { _prevRenderHub(); try { updateHubCard(); } catch (e) {} };
})();
