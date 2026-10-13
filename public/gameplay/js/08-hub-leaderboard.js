async function fetchLeaderboardRowsFromDb() {
  if (!db) return [];
  const snap = await db.ref('users').once('value');
  const val = snap.val() || {};
  const rows = [];
  Object.keys(val).forEach(uid => {
    const u = val[uid];
    const ps = u?.playerState || null;
    const username = u?.username || ps?.username || '';
    const displayName = u?.displayName || ps?.displayName || username;
    const level = Number(ps?.level || 1);
    const best = ps?.stats?.bestTimeSec;
    const bestTimeSec = (best == null) ? null : Number(best);
    const bestStreak = Number(ps?.stats?.bestStreak || 0);
    const spotlightLevel = Number(ps?.spotlightLevel || 0);
    const spotlightBestCorrect = Number(ps?.stats?.spotlightBestCorrect || 0);
    const spotlightBestStreak = Number(ps?.stats?.spotlightBestStreak || 0);
    const snakeventeenLevel = Number(ps?.snakeventeenLevel || 0);
    const snakeventeenBestStreak = Number(ps?.stats?.snakeventeenBestStreak || 0);
    const snakeventeenLongestLength = Number(ps?.stats?.snakeventeenLongestLength || 0);
    const avatarSrc = ps?.equippedAvatarKey ? `./imgs/assets/avatars/${ps.equippedAvatarKey}` : (ps?.equippedIdolKey ? `./imgs/${ps.equippedIdolKey}/1.jpg` : './imgs/assets/default_avatar.png');
    // ── NEW: sum love levels across all married idols ──
    const marriedIdols = ps?.marriedIdols || {};
    const love = ps?.love || {};
    let totalLoveLevel = 0;
    Object.keys(marriedIdols).forEach(k => {
      if (marriedIdols[k]) {
        totalLoveLevel += Number(love[k]?.level || 1);
      }
    });
    // ─────────────────────────────────────────────────
    rows.push({
      userId: uid,
      username,
      displayName,
      level,
      bestTimeSec,
      bestStreak,
      spotlightLevel,
      avatarSrc,
      totalLoveLevel,
      spotlightBestCorrect,
      spotlightBestStreak,
      snakeventeenLevel,
      snakeventeenBestStreak,
      snakeventeenLongestLength
    });
  });
  return rows.filter(r => r.username);
}

function fetchLeaderboardRowsFromLocal() {
  const users = JSON.parse(localStorage.getItem('users') || '{}');
  const rows = [];
  Object.keys(users).forEach(uid => {
    const u = users[uid];
    const psKey = `playerState:${u.username}`;
    let ps = {};
    try {
      ps = JSON.parse(localStorage.getItem(psKey) || '{}');
    } catch (e) {
      ps = {};
    }
    const level = Number(ps?.level || 1);
    const best = ps?.stats?.bestTimeSec;
    const bestTimeSec = (best == null) ? null : Number(best);
    const bestStreak = Number(ps?.stats?.bestStreak || 0);
    const spotlightLevel = Number(ps?.spotlightLevel || 0);
    const spotlightBestCorrect = Number(ps?.stats?.spotlightBestCorrect || 0);
    const spotlightBestStreak = Number(ps?.stats?.spotlightBestStreak || 0);
    const snakeventeenLevel = Number(ps?.snakeventeenLevel || 0);
    const snakeventeenBestStreak = Number(ps?.stats?.snakeventeenBestStreak || 0);
    const snakeventeenLongestLength = Number(ps?.stats?.snakeventeenLongestLength || 0);
    const avatarSrc = ps?.equippedIdolKey ? `./imgs/${ps?.equippedIdolKey}/1.jpg` : './imgs/assets/default_avatar.png';
    const marriedIdols = ps?.marriedIdols || {};
    const love = ps?.love || {};
    let totalLoveLevel = 0;
    Object.keys(marriedIdols).forEach(k => {
      if (marriedIdols[k]) totalLoveLevel += Number(love[k]?.level || 1);
    });
    rows.push({
      userId: uid,
      username: u.username,
      displayName: u.displayName || u.username,
      level,
      bestTimeSec,
      bestStreak,
      spotlightLevel,
      avatarSrc,
      totalLoveLevel,
      spotlightBestCorrect,
      spotlightBestStreak,
      snakeventeenLevel,
      snakeventeenBestStreak,
      snakeventeenLongestLength
    });
  });
  return rows;
}
const LEADERBOARD_MODE_ORDER = ['totalLoveLevel', 'level', 'bestStreak', 'bestTime', 'spotlightLevel', 'spotlightStreak', 'spotlightCorrect', 'snakeventeenLevel', 'snakeventeenStreak', 'snakeventeenLength'];
const LEADERBOARD_LABELS = {
  totalLoveLevel: 'Total Love Level',
  level: 'Highest Level',
  bestStreak: 'Best Streak',
  bestTime: 'Best Time',
  spotlightLevel: 'Highest Level',
  spotlightStreak: 'Best Streak',
  spotlightCorrect: 'Most Correct Hits',
  snakeventeenLevel: 'Highest Level',
  snakeventeenStreak: 'Best Streak',
  snakeventeenLength: 'Longest Length',
};
// New: 2-level menu state
let LB_MENU_LEVEL = 'top'; // 'top' or 'sub'
let LB_MENU_CAT = null; // 'showtime' | 'spotlight' | 'snakeventeen'
const LB_TOP_ITEMS = [{
  id: 'totalLoveLevel',
  label: 'Total Love Level',
  icon: 'fa-heart',
  sub: false
}, {
  id: 'showtime',
  label: 'Showtime',
  icon: 'fa-layer-group',
  sub: true
}, {
  id: 'spotlight',
  label: 'Spotlight',
  icon: 'fa-search',
  sub: true
}, {
  id: 'snakeventeen',
  label: 'Snakeventeen',
  icon: 'fa-gamepad',
  sub: true
}, ];
const LB_SUB_ITEMS = {
  showtime: [{
    id: 'level',
    label: 'Highest Level'
  }, {
    id: 'bestStreak',
    label: 'Best Streak'
  }, {
    id: 'bestTime',
    label: 'Best Time'
  }, ],
  spotlight: [{
    id: 'spotlightLevel',
    label: 'Highest Level'
  }, {
    id: 'spotlightStreak',
    label: 'Best Streak'
  }, {
    id: 'spotlightCorrect',
    label: 'Most Correct Hits'
  }, ],
  snakeventeen: [{
    id: 'snakeventeenLevel',
    label: 'Highest Level'
  }, {
    id: 'snakeventeenStreak',
    label: 'Best Streak'
  }, {
    id: 'snakeventeenLength',
    label: 'Longest Length'
  }, ],
};
let LEADERBOARD_MODE = 'totalLoveLevel';

function openLeaderboardModal() {
  showScreen('leaderboardScreen');
  renderLeaderboard(false);
}

function closeLeaderboardModal() {
  const overlay = document.getElementById('leaderboardOverlay');
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  document.getElementById('leaderboardModeDropdown').classList.remove('show');
}

function toggleLeaderboardModeDropdown(e) {
  if (e) e.stopPropagation();
  const screen = document.getElementById('leaderboardScreen');
  const isScreenVisible = screen && !screen.classList.contains('hidden');
  document.querySelectorAll('#leaderboardModeDropdown').forEach(dd => {
    const inScreen = screen && screen.contains(dd);
    // Only act on the dropdown that belongs to the currently visible context
    if (isScreenVisible && !inScreen) return;
    if (!isScreenVisible && inScreen) return;
    const isOpen = dd.classList.contains('show');
    dd.classList.toggle('show', !isOpen);
    dd.style.display = isOpen ? 'none' : 'block';
  });
}

function setLeaderboardMode(mode) {
  LEADERBOARD_MODE = mode;
  // Update all label elements
  document.querySelectorAll('#leaderboardModeLabel').forEach(label => {
    label.textContent = LEADERBOARD_LABELS[mode] || mode;
  });
  // Update all dropdown menus (both modal and screen)
  document.querySelectorAll('#leaderboardModeDropdown').forEach(dd => {
    dd.classList.remove('show');
    dd.style.display = 'none';
    const items = dd.querySelectorAll('.dropdown-item');
    const activeIdx = LEADERBOARD_MODE_ORDER.indexOf(mode);
    items.forEach((item, i) => {
      item.classList.toggle('active', i === activeIdx);
    });
  });
  renderLeaderboard(false);
}

function renderLeaderboardMenu(hostEl) {
  if (!hostEl) return;
  // ── 1. Create the dropdown shell ──────────────────────────────────
  hostEl.innerHTML = `
    <div class="dropdown-shell" style="position:relative; width:100%;">
      <button class="dropdown-toggle"
              style="width:100%; justify-content:space-between; padding:12px 14px; border-radius:14px;"
              id="lbCategoryToggle"
              onclick="toggleLbCategoryDropdown(event)">
        <span id="lbCategoryLabel" style="font-weight:900; color:#0f172a;">
          ${getLbCategoryLabel()}
        </span>
        <i class="fas fa-chevron-down" style="font-size:11px; opacity:0.6;"></i>
      </button>
      <div id="lbCategoryDropdown"
           class="dropdown-panel"
           style="display:none; position:absolute; top:110%; left:0; right:0; z-index:40;
                  background:rgba(255,255,255,0.98); border-radius:16px;
                  box-shadow:0 18px 40px rgba(15,23,42,0.20);
                  border:1px solid rgba(148,163,184,0.4);
                  padding:6px; min-width:unset; max-height:400px; overflow-y:auto;">
        <!-- Content rendered by renderLbCategoryDropdownContent() -->
      </div>
    </div>
  `;
  // 2. Render the dropdown content (top-level or sub-level based on LB_MENU_LEVEL)
  renderLbCategoryDropdownContent();
  // 3. Close dropdown when clicking outside
  document.addEventListener('click', handleLbDropdownOutsideClick);
}
// Which label to show on the dropdown toggle button

function getLbCategoryLabel() {
  if (LB_MENU_CAT) {
    const gameLabel = LB_TOP_ITEMS.find(x => x.id === LB_MENU_CAT)?.label || '';
    const subLabel = LB_SUB_ITEMS[LB_MENU_CAT]?.find(x => x.id === LEADERBOARD_MODE)?.label || '';
    return `${gameLabel} · ${subLabel}`.trim();
  }
  return LB_TOP_ITEMS.find(x => x.id === LEADERBOARD_MODE)?.label || 'Total Love Level';
}
// Show / hide the dropdown panel

function toggleLbCategoryDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('lbCategoryDropdown');
  if (!dd) return;
  const isOpen = !dd.classList.contains('show');
  dd.classList.toggle('show', isOpen);
  dd.style.display = isOpen ? 'block' : 'none';
}
// Close dropdown and remove outside click listener

function closeLbCategoryDropdown() {
  const dd = document.getElementById('lbCategoryDropdown');
  if (dd) {
    dd.classList.remove('show');
    dd.style.display = 'none';
  }
  // We can keep the listener, it will just return false if the panel is not open.
}
// Event listener for closing dropdown when clicking outside

function handleLbDropdownOutsideClick(e) {
  const dd = document.getElementById('lbCategoryDropdown');
  const toggle = document.getElementById('lbCategoryToggle');
  if (!dd || !toggle) return;
  if (!dd.contains(e.target) && e.target !== toggle) {
    closeLbCategoryDropdown();
  }
}

function renderLbCategoryDropdownContent() {
  const panel = document.getElementById('lbCategoryDropdown');
  if (!panel) return;
  const itemStyle = `
    display:flex; align-items:center; justify-content:space-between;
    padding:12px 14px; border-radius:14px; width:100%;
    font-weight:800; font-size:13px; color:#0f172a;
    background:rgba(255,255,255,0.9);
    border:1px solid rgba(148,163,184,0.3);
    box-shadow:0 4px 10px rgba(0,0,0,0.04);
    cursor:pointer; transition: background 0.15s;
  `;
  const activeStyle = `
    background:linear-gradient(135deg,var(--theme1),var(--theme2));
    border:1px solid rgba(255,255,255,0.5);
  `;
  if (LB_MENU_LEVEL === 'top') {
    panel.innerHTML = LB_TOP_ITEMS.map(item => {
      const isActive = !item.sub && LEADERBOARD_MODE === item.id;
      return `
        <button style="${itemStyle} ${isActive ? activeStyle : ''}"
                onclick="handleLbMenuItemClick('${item.id}', ${item.sub}, event)">
          <div style="display:flex;align-items:center;gap:10px;">
            <i class="fas ${item.icon}" style="width:16px;text-align:center;opacity:0.7;"></i>
            <span>${item.label}</span>
          </div>
          ${item.sub
            ? '<i class="fas fa-chevron-right" style="font-size:11px;opacity:0.4;"></i>'
            : (isActive ? '<i class="fas fa-check" style="font-size:11px;"></i>' : '')}
        </button>
      `;
    }).join('');
  } else if (LB_MENU_LEVEL === 'sub' && LB_MENU_CAT) {
    const subItems = LB_SUB_ITEMS[LB_MENU_CAT] || [];
    panel.innerHTML = `
      <button style="display:flex;align-items:center;gap:8px;padding:10px 14px;
                    border-radius:14px;width:100%;font-weight:900;font-size:12px;
                    color:rgba(15,23,42,0.6);background:transparent;border:none;
                    cursor:pointer;margin-bottom:4px;"
              onclick="handleLbBackToTop(event)">
        <i class="fas fa-arrow-left"></i>
        ${LB_TOP_ITEMS.find(x => x.id === LB_MENU_CAT)?.label || ''}
      </button>
      ${subItems.map(item => {
        const isActive = LEADERBOARD_MODE === item.id;
        return `
          <button style="${itemStyle} ${isActive ? activeStyle : ''}"
                  onclick="handleLbSubItemClick('${item.id}', event)">
            <span>${item.label}</span>
            ${isActive ? '<i class="fas fa-check" style="font-size:11px;"></i>' : ''}
          </button>
        `;
      }).join('')}
    `;
  }
}
// Updated to close the dropdown after selecting a sub‑item

function handleLbSubItemClick(modeId, e) {
  if (e) e.stopPropagation();
  LEADERBOARD_MODE = modeId;
  closeLbCategoryDropdown();
  renderLeaderboard();
  renderLeaderboardMenu(document.getElementById('lbMenuHost'));
}

function handleLbMenuItemClick(itemId, isSub, e) {
  if (e) e.stopPropagation(); // ← new
  if (isSub) {
    LB_MENU_LEVEL = 'sub';
    LB_MENU_CAT = itemId;
    renderLbCategoryDropdownContent();
  } else {
    LEADERBOARD_MODE = itemId;
    closeLbCategoryDropdown();
    renderLeaderboard();
    renderLeaderboardMenu(document.getElementById('lbMenuHost'));
  }
}

function handleLbSubItemClick(modeId, e) {
  if (e) e.stopPropagation(); // ← new
  LEADERBOARD_MODE = modeId;
  renderLeaderboard();
  renderLbCategoryDropdownContent();
  const toggleLabel = document.getElementById('lbCategoryLabel');
  if (toggleLabel) toggleLabel.textContent = getLbCategoryLabel();
}

function handleLbBackToTop(e) {
  if (e) e.stopPropagation(); // ← new
  LB_MENU_LEVEL = 'top';
  LB_MENU_CAT = null;
  renderLbCategoryDropdownContent();
}

async function renderLeaderboard(forceRefresh = false) {
  // Update menu
  const menuHost = document.getElementById('lbMenuHost');
  if (menuHost) renderLeaderboardMenu(menuHost);
  // Update header label
  const catLabel = LB_MENU_CAT ? (LB_TOP_ITEMS.find(x => x.id === LB_MENU_CAT)?.label || '') : '';
  const modeLabel = LEADERBOARD_LABELS[LEADERBOARD_MODE] || LEADERBOARD_MODE;
  const fullLabel = catLabel ? `${catLabel} · ${modeLabel}` : modeLabel;
  document.querySelectorAll('#leaderboardModeLabel').forEach(el => el.textContent = fullLabel);
  const host = document.getElementById('leaderboardList');
  if (!host) return;
  host.innerHTML = `<div class="text-sm text-gray-600 font-semibold p-2">Loading…</div>`;
  let rows = db ? await fetchLeaderboardRowsFromDb() : fetchLeaderboardRowsFromLocal();
  const mode = LEADERBOARD_MODE;
  // Sort
  if (mode === 'bestTime') {
    rows = rows.filter(r => r.bestTimeSec != null && isFinite(r.bestTimeSec)).sort((a, b) => a.bestTimeSec - b.bestTimeSec);
  } else if (mode === 'level') {
    rows = rows.sort((a, b) => b.level - a.level);
  } else if (mode === 'bestStreak') {
    rows = rows.sort((a, b) => (b.bestStreak || 0) - (a.bestStreak || 0));
  } else if (mode === 'spotlightLevel') {
    rows = rows.sort((a, b) => (b.spotlightLevel || 0) - (a.spotlightLevel || 0));
  } else if (mode === 'spotlightStreak') {
    rows = rows.sort((a, b) => (b.spotlightBestStreak || 0) - (a.spotlightBestStreak || 0));
  } else if (mode === 'spotlightCorrect') {
    rows = rows.filter(r => (r.spotlightBestCorrect || 0) > 0).sort((a, b) => (b.spotlightBestCorrect || 0) - (a.spotlightBestCorrect || 0));
  } else if (mode === 'snakeventeenLevel') {
    rows = rows.sort((a, b) => (b.snakeventeenLevel || 0) - (a.snakeventeenLevel || 0));
  } else if (mode === 'snakeventeenStreak') {
    rows = rows.sort((a, b) => (b.snakeventeenBestStreak || 0) - (a.snakeventeenBestStreak || 0));
  } else if (mode === 'snakeventeenLength') {
    rows = rows.sort((a, b) => (b.snakeventeenLongestLength || 0) - (a.snakeventeenLongestLength || 0));
  } else { // totalLoveLevel
    rows = rows.sort((a, b) => (b.totalLoveLevel || 0) - (a.totalLoveLevel || 0));
  }
  rows = rows.slice(0, 100);
  if (!rows.length) {
    host.innerHTML = `<div class="glass-card rounded-2xl p-4 text-sm text-gray-600">No data yet.</div>`;
    return;
  }
  host.innerHTML = '';
  let rank = 1,
    prevVal = null;
  rows.forEach((r, idx) => {
    let val;
    if (mode === 'bestTime') val = r.bestTimeSec;
    else if (mode === 'level') val = r.level;
    else if (mode === 'bestStreak') val = r.bestStreak;
    else if (mode === 'spotlightLevel') val = r.spotlightLevel;
    else if (mode === 'spotlightStreak') val = r.spotlightBestStreak;
    else if (mode === 'spotlightCorrect') val = r.spotlightBestCorrect;
    else if (mode === 'snakeventeenLevel') val = r.snakeventeenLevel;
    else if (mode === 'snakeventeenStreak') val = r.snakeventeenBestStreak;
    else if (mode === 'snakeventeenLength') val = r.snakeventeenLongestLength;
    else val = r.totalLoveLevel;
    if (prevVal !== null && val !== prevVal) rank++;
    prevVal = val;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
    const valDisplay = mode === 'bestTime' ? `${Number(val) < 1 ? Number(val).toFixed(3) : Number(val).toFixed(2)}s` : String(val ?? 0);
    const row = document.createElement('div');
    row.className = 'glass-card rounded-2xl p-3 flex items-center justify-between gap-3';
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-7 text-center font-black" style="color:#f59e0b;font-size:18px;">
          ${medal || rank}
        </div>
        <img class="avatar-sm" src="${r.avatarSrc || './imgs/assets/default_avatar.png'}" alt="avatar"/>
        <div class="min-w-0">
          <div class="font-extrabold text-gray-900 truncate">${escapeHtml(r.displayName || r.username)}</div>
          <div class="text-xs text-gray-500 font-bold truncate">@${escapeHtml(r.username)}</div>
        </div>
      </div>
      <div class="text-right flex-shrink-0">
        <div class="text-xs text-gray-500 font-bold">${modeLabel}</div>
        <div class="font-black text-gray-900">${valDisplay}</div>
      </div>
    `;
    host.appendChild(row);
  });
}

function renderHub() {
  ensureDailyResetIfNeeded();
  document.getElementById('hubUserName').textContent = currentUser?.displayName || "Carat";
  document.getElementById('hubLevel').textContent = GAME_STATE.level;
  document.getElementById('hubCoins').textContent = GAME_STATE.coins;
  document.getElementById('gameCoins').textContent = GAME_STATE.coins;
  const qc = document.getElementById('questsCoins');
  if (qc) qc.textContent = GAME_STATE.coins;
  const ic = document.getElementById('idolsCoins');
  if (ic) ic.textContent = GAME_STATE.coins;
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) shopCoins.textContent = GAME_STATE.coins;
  const showtimeLvl = document.getElementById('showtimeLevelLabel');
  if (showtimeLvl) showtimeLvl.textContent = 'Lv. ' + (GAME_STATE.level || 0);
  const spotlightLvl = document.getElementById('spotlightLevelLabel');
  if (spotlightLvl) spotlightLvl.textContent = 'Lv. ' + (GAME_STATE.spotlightLevel || 0);
  const snakeLvl = document.getElementById('snakeventeenLevelLabel');
  if (snakeLvl) snakeLvl.textContent = 'Lv. ' + (GAME_STATE.snakeventeenLevel || 0);
  const chip = document.getElementById('hubStreakChip');
  if (chip) chip.textContent = String(GAME_STATE.streak || 0);
  const rings = document.getElementById('ringsCount');
  if (rings) rings.textContent = String(GAME_STATE.rings || 0);
  const ringsShop = document.getElementById('ringsCountShop');
  if (ringsShop) {
    // BUG-G03: match the label+count format used by updateRingsOwnedDisplay()
    ringsShop.innerHTML = `<span>💍 Rings owned</span><span class="font-black">${GAME_STATE.rings || 0}</span>`;
  }
  const showtimeStreakEl = document.getElementById('showtimeStreakCount');
  if (showtimeStreakEl) showtimeStreakEl.textContent = String(GAME_STATE.streak || 0);
  const spotlightStreakHubEl = document.getElementById('spotlightStreakCount');
  if (spotlightStreakHubEl) spotlightStreakHubEl.textContent = String(GAME_STATE.spotlightStreak || 0);
  // P-06 FIX: keep snakeventeen streak display in sync from the base function
  const _snakeStreakEl = document.getElementById('snakeventeenStreakCount');
  if (_snakeStreakEl) _snakeStreakEl.textContent = String(GAME_STATE.snakeventeenStreak || 0);
  renderAvatars();
  updateDailyDrawUI();
  updateDailyWinsUI();
  updateNewsBadge();
  updateFriendsBadges();
  renderShopItems(); // build shop items list
  updateHamburgerBadge();
  updatePanelBadges();
  updateCliqueBadge();
}
