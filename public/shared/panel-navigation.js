(function () {
  'use strict';

  const PANEL_IDS = ['hubScreen', 'idolsScreen', 'shopScreen', 'questsScreen'];
  const PANEL_NAMES = ['hub', 'idols', 'shop', 'quests'];
  const PANEL_BY_NAME = Object.fromEntries(PANEL_NAMES.map((name, index) => [name, PANEL_IDS[index]]));
  const PANEL_INDEX = Object.fromEntries(PANEL_IDS.map((id, index) => [id, index]));
  const TRANSITION_MS = 390;
  const DOCK_ID = 'hubNavigationDock';
  const TRANSITION_CLASSES = [
    'panel-nav-enter-from-right', 'panel-nav-enter-from-left',
    'panel-nav-exit-to-left', 'panel-nav-exit-to-right'
  ];
  const DOCK_HIDDEN_CLASS = 'panel-nav-dock-hidden';

  const originalShowScreen = window.showScreen;
  if (typeof originalShowScreen !== 'function') return;

  let activePanelId = findVisiblePanel();
  let cleanupTimer = 0;
  let touchStart = null;
  let suppressClickUntil = 0;

  function findVisiblePanel() {
    return PANEL_IDS.find(id => {
      const element = document.getElementById(id);
      return element && !element.classList.contains('hidden');
    }) || null;
  }

  function getDock() {
    return document.getElementById(DOCK_ID);
  }

  function clearTransitionClasses() {
    PANEL_IDS.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.classList.remove(...TRANSITION_CLASSES);
    });
  }

  function setActivePanel(panelId) {
    const dock = getDock();
    if (!dock) return;
    dock.querySelectorAll('[data-main-panel]').forEach(button => {
      const selected = button.dataset.mainPanel === PANEL_NAMES[PANEL_INDEX[panelId]];
      button.classList.toggle('active', selected);
      button.classList.toggle('text-gray-400', !selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
  }

  function navigateScreen(screenId) {
    const targetIsMainPanel = PANEL_IDS.includes(screenId);
    const fromId = activePanelId && document.getElementById(activePanelId) && !document.getElementById(activePanelId).classList.contains('hidden')
      ? activePanelId
      : findVisiblePanel();

    if (!targetIsMainPanel) {
      clearTimeout(cleanupTimer);
      clearTransitionClasses();
      const dock = getDock();
      if (dock) dock.classList.add(DOCK_HIDDEN_CLASS);
      originalShowScreen(screenId);
      activePanelId = null;
      return;
    }

    if (fromId === screenId) {
      originalShowScreen(screenId);
      activePanelId = screenId;
      setActivePanel(screenId);
      const dock = getDock();
      if (dock) dock.classList.toggle(DOCK_HIDDEN_CLASS, screenId !== 'hubScreen');
      return;
    }

    clearTimeout(cleanupTimer);
    clearTransitionClasses();

    const fromIndex = fromId in PANEL_INDEX ? PANEL_INDEX[fromId] : null;
    const toIndex = PANEL_INDEX[screenId];
    let exitClass = '';
    let enterClass = '';

    if (fromIndex !== null) {
      const movingRight = toIndex > fromIndex;
      exitClass = movingRight ? 'panel-nav-exit-to-left' : 'panel-nav-exit-to-right';
      enterClass = movingRight ? 'panel-nav-enter-from-right' : 'panel-nav-enter-from-left';
      const fromElement = document.getElementById(fromId);
      const toElement = document.getElementById(screenId);
      if (fromElement) fromElement.classList.add(exitClass);
      if (toElement) toElement.classList.add(enterClass);
    }

    const dock = getDock();
    if (dock) dock.classList.toggle(DOCK_HIDDEN_CLASS, screenId !== 'hubScreen');

    if (screenId === 'hubScreen' && typeof window.renderHub === 'function') {
      try { window.renderHub(); } catch (e) {}
    }

    originalShowScreen(screenId);
    activePanelId = screenId;
    setActivePanel(screenId);

    cleanupTimer = window.setTimeout(() => {
      clearTransitionClasses();
    }, TRANSITION_MS);
  }

  window.showScreen = navigateScreen;

  function goToPanel(name) {
    const screenId = PANEL_BY_NAME[name];
    if (!screenId || activePanelId === screenId) return;
    if (name === 'hub') {
      navigateScreen(screenId);
    } else if (name === 'idols' && typeof window.openIdols === 'function') {
      window.openIdols();
    } else if (name === 'shop' && typeof window.openShop === 'function') {
      window.openShop();
    } else if (name === 'quests' && typeof window.openQuests === 'function') {
      window.openQuests();
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-main-panel]');
    if (!button || !getDock() || !getDock().contains(button)) return;
    event.preventDefault();
    goToPanel(button.dataset.mainPanel);
  });

  function isMainPanelTarget(target) {
    return !!target.closest('#hubScreen, #idolsScreen, #shopScreen, #questsScreen');
  }

  function isGestureExcluded(target) {
    return !!target.closest('button, a, input, textarea, select, label, [role="button"], .nav-item, .modal-overlay, .reward-popup-overlay, #slidePanelOverlay, #offlineLoveLock, #idolUnlockOverlay');
  }

  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) {
      touchStart = null;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isMainPanelTarget(target) || isGestureExcluded(target)) {
      touchStart = null;
      return;
    }
    touchStart = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      target,
      at: Date.now()
    };
  }, { passive: true });

  document.addEventListener('touchend', event => {
    if (!touchStart || !event.changedTouches.length) return;
    const start = touchStart;
    touchStart = null;
    if (!start.target.isConnected || Date.now() - start.at > 900) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 58 || Math.abs(deltaX) < Math.abs(deltaY) * 1.18) return;

    const current = activePanelId || findVisiblePanel();
    const index = PANEL_INDEX[current];
    if (index === undefined) return;
    const nextIndex = deltaX < 0 ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= PANEL_IDS.length) return;
    suppressClickUntil = Date.now() + 500;
    goToPanel(PANEL_NAMES[nextIndex]);
  }, { passive: true });

  document.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });

  document.addEventListener('click', event => {
    if (Date.now() >= suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.PanelNavigation = {
    go: goToPanel,
    current: () => PANEL_NAMES[PANEL_INDEX[activePanelId]] || null
  };
})();
