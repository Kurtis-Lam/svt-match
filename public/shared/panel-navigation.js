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
  const DOCK_ENTER_CLASS = 'panel-nav-dock-entering';

  const originalShowScreen = window.showScreen;
  if (typeof originalShowScreen !== 'function') return;

  let activePanelId = findVisiblePanel();
  let cleanupTimer = 0;
  let dockTimer = 0;
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
    if (!dock || !PANEL_INDEX.hasOwnProperty(panelId)) return;
    dock.querySelectorAll('[data-main-panel]').forEach(button => {
      const selected = button.dataset.mainPanel === PANEL_NAMES[PANEL_INDEX[panelId]];
      button.classList.toggle('active', selected);
      button.classList.toggle('text-gray-400', !selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
  }

  function setDockVisible(visible) {
    const dock = getDock();
    if (!dock) return;
    clearTimeout(dockTimer);
    dock.classList.remove(DOCK_ENTER_CLASS);
    if (!visible) {
      dock.classList.add(DOCK_HIDDEN_CLASS);
      dock.setAttribute('aria-hidden', 'true');
      return;
    }
    const wasHidden = dock.classList.contains(DOCK_HIDDEN_CLASS);
    dock.classList.remove(DOCK_HIDDEN_CLASS);
    dock.setAttribute('aria-hidden', 'false');
    if (wasHidden) {
      dock.classList.add(DOCK_ENTER_CLASS);
      dockTimer = window.setTimeout(() => dock.classList.remove(DOCK_ENTER_CLASS), TRANSITION_MS + 30);
    }
  }

  function hideUnrelatedScreens(fromId, toId) {
    document.querySelectorAll('.screen').forEach(screen => {
      if (screen.id === fromId || screen.id === toId) return;
      screen.classList.add('hidden');
      screen.classList.remove(...TRANSITION_CLASSES, 'slide-left');
    });
  }

  function navigateScreen(screenId) {
    const targetIsMainPanel = PANEL_IDS.includes(screenId);
    const visiblePanel = findVisiblePanel();
    const fromId = activePanelId && document.getElementById(activePanelId) && !document.getElementById(activePanelId).classList.contains('hidden')
      ? activePanelId
      : visiblePanel;

    if (!targetIsMainPanel) {
      clearTimeout(cleanupTimer);
      clearTransitionClasses();
      setDockVisible(false);
      originalShowScreen(screenId);
      activePanelId = null;
      return;
    }

    if (fromId === screenId) {
      originalShowScreen(screenId);
      activePanelId = screenId;
      setActivePanel(screenId);
      setDockVisible(screenId === 'hubScreen');
      return;
    }

    clearTimeout(cleanupTimer);
    clearTransitionClasses();

    const fromIndex = Object.prototype.hasOwnProperty.call(PANEL_INDEX, fromId) ? PANEL_INDEX[fromId] : null;
    const toIndex = PANEL_INDEX[screenId];
    const fromElement = fromId ? document.getElementById(fromId) : null;
    const toElement = document.getElementById(screenId);

    if (fromIndex !== null && fromElement && toElement) {
      const movingRight = toIndex > fromIndex;
      const exitClass = movingRight ? 'panel-nav-exit-to-left' : 'panel-nav-exit-to-right';
      const enterClass = movingRight ? 'panel-nav-enter-from-right' : 'panel-nav-enter-from-left';

      hideUnrelatedScreens(fromId, screenId);
      fromElement.classList.add(exitClass);
      toElement.classList.add(enterClass);
      toElement.classList.remove('hidden', 'slide-left');

      if (screenId === 'hubScreen' && typeof window.renderHub === 'function') {
        try { window.renderHub(); } catch (e) {}
      }

      setDockVisible(screenId === 'hubScreen');
      activePanelId = screenId;
      setActivePanel(screenId);
      cleanupTimer = window.setTimeout(() => {
        if (fromElement !== toElement) {
          // The base .screen rule has its own transform transition. Disable it
          // while hiding the outgoing panel so it cannot slide back across the
          // screen after the directional exit animation has finished.
          fromElement.style.transition = 'none';
          fromElement.classList.add('hidden');
          clearTransitionClasses();
          void fromElement.offsetHeight;
          fromElement.style.removeProperty('transition');
        } else {
          clearTransitionClasses();
        }
      }, TRANSITION_MS);
      return;
    }

    clearTransitionClasses();
    originalShowScreen(screenId);
    if (screenId === 'hubScreen' && typeof window.renderHub === 'function') {
      try { window.renderHub(); } catch (e) {}
    }
    activePanelId = screenId;
    setActivePanel(screenId);
    setDockVisible(screenId === 'hubScreen');
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
    const target = event.target instanceof Element ? event.target : null;
    const button = target && target.closest('[data-main-panel]');
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

  setDockVisible(activePanelId === 'hubScreen');

  window.PanelNavigation = {
    go: goToPanel,
    current: () => PANEL_NAMES[PANEL_INDEX[activePanelId]] || null
  };
})();
