(function () {
  'use strict';

  const fallback = {
    defaults: { actionLabel: 'Continue', closeLabel: 'Close', eyebrow: 'REWARD', icon: '🎁' },
    types: {
      dailyWheel: { title: 'Daily Draw Reward', eyebrow: 'DAILY DRAW', icon: '🪙', description: 'Your Daily Draw coins are ready to collect.', actionLabel: 'Claim' },
      svtPass: { title: 'SVT Pass Rewards', eyebrow: 'SVT PASS', icon: '🎁', description: 'Claim each unlocked level.', actionLabel: 'Close' },
      svtPassMission: { title: 'Mission Reward', eyebrow: 'SVT PASS MISSION', icon: '⭐', description: 'Season XP added to your pass.', actionLabel: 'Continue' },
      quest: { title: 'Quest Reward', eyebrow: 'QUEST COMPLETE', icon: '⭐', description: 'You have claimed the quest reward.', actionLabel: 'Continue' }
    }
  };

  const configPromise = fetch('/shared/reward-popups.json', { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('Reward popup config unavailable'); return response.json(); })
    .catch(() => fallback);
  let activeOverlay = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function close() {
    if (!activeOverlay) return;
    const overlay = activeOverlay;
    activeOverlay = null;
    overlay.remove();
    document.removeEventListener('keydown', handleEscape);
  }

  function handleEscape(event) {
    if (event.key === 'Escape') close();
  }

  function createOverlay(type, options, config, trackMode) {
    close();
    const defaults = config.defaults || fallback.defaults;
    const def = (config.types && config.types[type]) || fallback.types[type] || {};
    const title = options.title || def.title || 'Reward';
    const eyebrow = options.eyebrow || def.eyebrow || defaults.eyebrow;
    const description = options.description || def.description || '';
    const overlay = document.createElement('div');
    overlay.className = `reward-popup-overlay${trackMode ? ' reward-popup-overlay--track' : ''}`;
    overlay.setAttribute('role', 'presentation');
    const header = `
      <header class="reward-popup-header">
        <div class="reward-popup-eyebrow">${esc(eyebrow)}</div>
        <h2 class="reward-popup-title">${esc(title)}</h2>
        ${description ? `<p class="reward-popup-desc">${esc(description)}</p>` : ''}
        <button class="reward-popup-close" type="button" aria-label="${esc(defaults.closeLabel || 'Close')}">×</button>
      </header>`;
    overlay.innerHTML = `<section class="reward-popup-panel${trackMode ? ' reward-popup-panel--track' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">${header}${options.bodyHtml || ''}</section>`;
    overlay.addEventListener('click', event => { if (event.target === overlay && options.dismissOnBackdrop !== false) close(); });
    overlay.querySelector('.reward-popup-close').addEventListener('click', close);
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    document.addEventListener('keydown', handleEscape);
    return { overlay, def, defaults };
  }

  async function show(options = {}) {
    const config = await configPromise;
    const type = options.type || 'quest';
    const { overlay, def, defaults } = createOverlay(type, options, config, false);
    const rewards = Array.isArray(options.rewards) ? options.rewards : [];
    const icon = options.icon || (rewards.length === 1 ? rewards[0].icon : null) || def.icon || defaults.icon;
    const amount = options.amount === undefined || options.amount === null ? null : Number(options.amount);
    const rewardLabel = options.rewardLabel || (type === 'dailyWheel' || type === 'quest' ? 'coins' : 'Season XP');
    const amountText = amount === null || !Number.isFinite(amount) ? '' : `${options.showPlus === false ? '' : '+'}${amount.toLocaleString()}`;
    const rewardHtml = rewards.length
      ? `<div class="reward-popup-reward-card">${rewards.map(item => `<div class="reward-popup-reward-icon">${esc(item.icon || '🎁')}</div><div class="reward-popup-reward-amount">${esc(item.amount ?? '')}</div><div class="reward-popup-reward-label">${esc(item.label || '')}</div>`).join('')}</div>`
      : `<div class="reward-popup-reward-card"><div class="reward-popup-reward-icon">${esc(icon)}</div><div class="reward-popup-reward-amount">${esc(amountText)}</div><div class="reward-popup-reward-label">${esc(rewardLabel)}</div></div>`;
    const body = document.createElement('div');
    body.className = 'reward-popup-body';
    body.innerHTML = rewardHtml;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'reward-popup-action';
    action.textContent = options.actionLabel || def.actionLabel || defaults.actionLabel || 'Continue';
    overlay.querySelector('.reward-popup-panel').append(body, action);
    action.addEventListener('click', async () => {
      if (action.disabled) return;
      action.disabled = true;
      try {
        if (typeof options.onAction === 'function') await options.onAction();
      } finally {
        action.disabled = false;
        if (activeOverlay === overlay && options.closeOnAction !== false) close();
      }
    });
    action.focus({ preventScroll: true });
    return overlay;
  }

  async function showTrack(options = {}) {
    const config = await configPromise;
    const type = options.type || 'svtPass';
    const { overlay, def } = createOverlay(type, options, config, true);
    const body = document.createElement('div');
    body.className = 'reward-popup-track-scroll';
    body.innerHTML = options.bodyHtml || '';
    const footer = document.createElement('footer');
    footer.className = 'reward-popup-track-footer';
    footer.innerHTML = `<span>Season XP: <b>${esc(options.xpText || '0')}</b></span><span>${esc(options.claimedText || 'Tap an unlocked reward to claim')}</span>`;
    const panel = overlay.querySelector('.reward-popup-panel');
    panel.append(body, footer);

    requestAnimationFrame(() => {
      if (activeOverlay !== overlay) return;
      const list = body.querySelector('.reward-track-list');
      const current = list && list.querySelector(`[data-level="${Number(options.currentLevel) || 1}"]`);
      if (list && current) {
        const centerPadding = Math.max(0, Math.floor((body.clientHeight - current.offsetHeight) / 2));
        list.style.paddingTop = `${centerPadding}px`;
        list.style.paddingBottom = `${centerPadding}px`;
        body.scrollTop = Math.max(0, current.offsetTop - centerPadding);
        current.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      const closeButton = overlay.querySelector('.reward-popup-close');
      if (closeButton) closeButton.focus({ preventScroll: true });
    });
    return overlay;
  }

  window.RewardPopups = { show, showTrack, close };
})();
