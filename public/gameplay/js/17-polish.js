(function () {
  'use strict';

  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hapticsOn() {
    try { return localStorage.getItem('svt:haptics') !== 'off'; } catch (e) { return true; }
  }

  function buzz(pattern) {
    if (reduceMotion || document.hidden || !hapticsOn()) return;
    if (typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  var toastTimer = null;
  var toastEl = null;

  window.showToast = function (message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    type = type || 'success';
    var colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-slate-900' };
    var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    clearTimeout(toastTimer);
    if (toastEl) toastEl.remove();
    var toast = document.createElement('div');
    toast.className = 'toast ' + (colors[type] || colors.info) + ' text-white shadow-lg flex items-center gap-2 svt-toast';
    toast.setAttribute('role', 'status');
    var icon = document.createElement('i');
    icon.className = 'fas ' + (icons[type] || icons.info);
    var text = document.createElement('span');
    text.textContent = String(message);
    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);
    toastEl = toast;
    if (type === 'error') buzz([30, 40, 30]);
    toastTimer = setTimeout(function () {
      toast.classList.add('svt-toast-out');
      setTimeout(function () {
        toast.remove();
        if (toastEl === toast) toastEl = null;
      }, 260);
    }, 1800);
  };

  var originalSave = window.savePlayerState;
  var inFlight = null;
  var trailing = null;

  window.savePlayerState = function () {
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(originalSave)
        .catch(function (e) { console.warn('save failed', e); })
        .finally(function () { inFlight = null; });
      return inFlight;
    }
    if (!trailing) {
      trailing = inFlight.then(function () {
        trailing = null;
        return window.savePlayerState();
      });
    }
    return trailing;
  };

  var onlineFlush = null;
  var originalStopOnline = window.stopSecondsOnlineTicker;

  window.stopSecondsOnlineTicker = function () {
    if (onlineFlush) { onlineFlush(); onlineFlush = null; }
    originalStopOnline();
  };

  window.startSecondsOnlineTicker = function () {
    window.stopSecondsOnlineTicker();
    if (!db || !currentUser || !currentUser.id) return;
    var uid = currentUser.id;
    var pending = 0;
    var flush = function () {
      if (!pending) return;
      var n = pending;
      pending = 0;
      var base = 'users/' + uid + '/analytics';
      db.ref(base + '/secondsOnline/' + hkDayKey())
        .transaction(function (cur) { return (Number(cur) || 0) + n; })
        .then(function () { return db.ref(base + '/lastSeenAt').set(Date.now()); })
        .catch(function () { pending += n; });
    };
    onlineFlush = flush;
    __secondsOnlineInterval = setInterval(function () {
      if (!document.hidden) pending++;
      if (pending >= 30) flush();
    }, 1000);
  };

  var friendsWasOn = false;
  var dailyWasOn = false;

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      friendsWasOn = !!__friendsMetaRefresh;
      dailyWasOn = !!__dailyResetWatcher;
      if (friendsWasOn) stopFriendsMetaRefresh();
      if (dailyWasOn) stopDailyResetWatcher();
      if (currentUser) window.savePlayerState();
      if (onlineFlush) onlineFlush();
    } else {
      if (friendsWasOn && currentUser) startFriendsMetaRefresh();
      if (dailyWasOn) {
        ensureDailyResetIfNeeded();
        startDailyResetWatcher();
      }
    }
  });

  window.addEventListener('pagehide', function () {
    if (onlineFlush) onlineFlush();
  });

  var originalLevelComplete = window.levelComplete;
  window.levelComplete = function () {
    buzz([25, 50, 25, 50, 90]);
    return originalLevelComplete.apply(this, arguments);
  };

  window.svtMissFx = function (cards) {
    if (reduceMotion || !cards || !cards.length) return;
    setTimeout(function () {
      cards.forEach(function (c) { c.classList.add('svt-miss'); });
      buzz([14, 30, 14]);
      setTimeout(function () {
        cards.forEach(function (c) { c.classList.remove('svt-miss'); });
      }, 420);
    }, 260);
  };

  function sparkle(el) {
    if (reduceMotion) return;
    var app = document.getElementById('app');
    if (!app) return;
    var layer = document.getElementById('svtFx');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'svtFx';
      app.appendChild(layer);
    }
    var a = app.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2 - a.left;
    var cy = r.top + r.height / 2 - a.top;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 7; i++) {
      var p = document.createElement('div');
      var ang = (Math.PI * 2 * i) / 7 + Math.random() * 0.6;
      var dist = 34 + Math.random() * 34;
      p.className = 'svt-spark';
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.addEventListener('animationend', function () { this.remove(); }, { once: true });
      frag.appendChild(p);
    }
    layer.appendChild(frag);
  }

  var grid = document.getElementById('cardGrid');
  if (grid && window.MutationObserver) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var el = muts[i].target;
        if (!el.classList || !el.classList.contains('card')) continue;
        var was = (muts[i].oldValue || '').split(' ');
        if (el.classList.contains('matched') && was.indexOf('matched') === -1) {
          sparkle(el);
          buzz(18);
        } else if (el.classList.contains('flipped') && was.indexOf('flipped') === -1) {
          buzz(6);
        }
      }
    }).observe(grid, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
  }

  var app = document.getElementById('app');
  if (app && window.MutationObserver) {
    var scheduled = false;
    var fixImages = function () {
      scheduled = false;
      var imgs = app.querySelectorAll('img:not([decoding])');
      for (var i = 0; i < imgs.length; i++) imgs[i].decoding = 'async';
    };
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(fixImages);
    }).observe(app, { childList: true, subtree: true });
    fixImages();
  }
})();
