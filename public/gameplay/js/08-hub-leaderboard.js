// ── Leaderboard rows ──────────────────────────────────────────────────────
function lbRowFromPlayerState(uid, username, displayName, ps, avatarSrc) {
  const marriedIdols = ps?.marriedIdols || {};
  const love = ps?.love || {};
  let totalLoveLevel = 0;
  Object.keys(marriedIdols).forEach(k => {
    if (marriedIdols[k]) totalLoveLevel += Number(love[k]?.level || 1);
  });
  const best = ps?.stats?.bestTimeSec;
  return {
    userId: uid,
    username,
    displayName,
    avatarSrc,
    totalLoveLevel,
    level: Number(ps?.level || 1),
    bestTimeSec: (best == null) ? null : Number(best),
    bestStreak: Number(ps?.stats?.bestStreak || 0),
    spotlightLevel: Number(ps?.spotlightLevel || 0),
    spotlightBestCorrect: Number(ps?.stats?.spotlightBestCorrect || 0),
    spotlightBestStreak: Number(ps?.stats?.spotlightBestStreak || 0),
    snakeventeenLevel: Number(ps?.snakeventeenLevel || 0),
    snakeventeenBestStreak: Number(ps?.stats?.snakeventeenBestStreak || 0),
    snakeventeenLongestLength: Number(ps?.stats?.snakeventeenLongestLength || 0),
    echoLevel: Number(ps?.meta?.echo?.level || 0),
    echoBestStreak: Number(ps?.meta?.echo?.bestStreak || 0),
    echoBestEndless: Number(ps?.meta?.echo?.bestEndless || 0),
  };
}

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
    const avatarSrc = ps?.equippedAvatarKey ? `./imgs/assets/avatars/${ps.equippedAvatarKey}` : (ps?.equippedIdolKey ? `./imgs/${ps.equippedIdolKey}/1.jpg` : './imgs/assets/default_avatar.png');
    rows.push(lbRowFromPlayerState(uid, username, displayName, ps, avatarSrc));
  });
  return rows.filter(r => r.username);
}

function fetchLeaderboardRowsFromLocal() {
  const users = JSON.parse(localStorage.getItem('users') || '{}');
  const rows = [];
  Object.keys(users).forEach(uid => {
    const u = users[uid];
    let ps = {};
    try {
      ps = JSON.parse(localStorage.getItem(`playerState:${u.username}`) || '{}');
    } catch (e) {
      ps = {};
    }
    const avatarSrc = ps?.equippedIdolKey ? `./imgs/${ps.equippedIdolKey}/1.jpg` : './imgs/assets/default_avatar.png';
    rows.push(lbRowFromPlayerState(uid, u.username, u.displayName || u.username, ps, avatarSrc));
  });
  return rows;
}

// ── Categories & metrics (Choreo Echo only shows the Endless leaderboard) ──
const LB_CATS = [
  { id: 'love', label: 'Love', icon: 'fa-heart', metrics: [
    { id: 'totalLoveLevel', label: 'Total Love Level', unit: 'lv', field: 'totalLoveLevel' }] },
  { id: 'showtime', label: 'Showtime', icon: 'fa-layer-group', metrics: [
    { id: 'level', label: 'Highest Level', unit: 'lv', field: 'level' },
    { id: 'bestStreak', label: 'Best Streak', unit: '🔥', field: 'bestStreak' },
    { id: 'bestTime', label: 'Best Time', unit: 's', field: 'bestTimeSec', asc: true }] },
  { id: 'spotlight', label: 'Spotlight', icon: 'fa-magnifying-glass', metrics: [
    { id: 'spotlightLevel', label: 'Highest Level', unit: 'lv', field: 'spotlightLevel' },
    { id: 'spotlightStreak', label: 'Best Streak', unit: '🔥', field: 'spotlightBestStreak' },
    { id: 'spotlightCorrect', label: 'Most Correct Hits', unit: 'hits', field: 'spotlightBestCorrect' }] },
  { id: 'snakeventeen', label: 'Snakeventeen', icon: 'fa-gamepad', metrics: [
    { id: 'snakeventeenLevel', label: 'Highest Level', unit: 'lv', field: 'snakeventeenLevel' },
    { id: 'snakeventeenStreak', label: 'Best Streak', unit: '🔥', field: 'snakeventeenBestStreak' },
    { id: 'snakeventeenLength', label: 'Longest Length', unit: 'len', field: 'snakeventeenLongestLength' }] },
  { id: 'echo', label: 'Choreo Echo', icon: 'fa-music', metrics: [
    { id: 'echoLevel', label: 'Highest Level', unit: 'lv', field: 'echoLevel' },
    { id: 'echoStreak', label: 'Best Streak', unit: '🔥', field: 'echoBestStreak' },
    { id: 'echoEndless', label: 'Endless Encore · Best Round', unit: 'rounds', field: 'echoBestEndless' }] },
];

let LEADERBOARD_MODE = 'totalLoveLevel';
let LB_CACHE = { rows: null, at: 0 };
let LB_LOAD_TOKEN = 0;
const LB_CACHE_MS = 60 * 1000;

function lbFindMetric(id) {
  for (const c of LB_CATS) {
    const m = c.metrics.find(x => x.id === id);
    if (m) return { cat: c, metric: m };
  }
  return { cat: LB_CATS[0], metric: LB_CATS[0].metrics[0] };
}

function openLeaderboardModal() {
  showScreen('leaderboardScreen');
  renderLeaderboard(false);
}

function lbDropdownOpen(open) {
  const panel = document.getElementById('lbPanel');
  const btn = document.getElementById('lbToggle');
  if (!panel || !btn) return;
  panel.classList.toggle('show', open);
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
}

function toggleLbDropdown(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('lbPanel');
  lbDropdownOpen(!(panel && panel.classList.contains('show')));
}

document.addEventListener('click', e => {
  const panel = document.getElementById('lbPanel');
  if (panel && panel.classList.contains('show') && !panel.contains(e.target)) lbDropdownOpen(false);
});

function selectLbMetric(id, e) {
  if (e) e.stopPropagation();
  LEADERBOARD_MODE = id;
  lbDropdownOpen(false);
  renderLeaderboard(false);
}

function renderLeaderboardMenu(hostEl) {
  if (!hostEl) return;
  const { cat, metric } = lbFindMetric(LEADERBOARD_MODE);
  const groups = LB_CATS.map(c => `
    <div class="lb-group">
      <div class="lb-group-title"><i class="fas ${c.icon}"></i>${c.label}</div>
      ${c.metrics.map(m => `
        <button type="button" class="lb-opt ${m.id === LEADERBOARD_MODE ? 'on' : ''}" onclick="selectLbMetric('${m.id}', event)">
          <span>${m.label}</span>${m.id === LEADERBOARD_MODE ? '<i class="fas fa-check"></i>' : ''}
        </button>`).join('')}
    </div>`).join('');
  hostEl.innerHTML = `
    <div class="lb-dd">
      <button type="button" id="lbToggle" class="lb-toggle" aria-haspopup="listbox" aria-expanded="false" onclick="toggleLbDropdown(event)">
        <span class="lb-toggle-ico"><i class="fas ${cat.icon}"></i></span>
        <span class="lb-toggle-txt"><small>${cat.label}</small><b>${metric.label}</b></span>
        <i class="fas fa-chevron-down lb-toggle-chev"></i>
      </button>
      <div id="lbPanel" class="lb-panel" role="listbox">${groups}</div>
    </div>`;
}

function lbSkeleton() {
  return Array.from({ length: 7 }, () => `
    <div class="lb-skel"><i class="lb-skel-dot"></i><i class="lb-skel-av"></i>
      <div class="lb-skel-lines"><i></i><i></i></div><i class="lb-skel-val"></i></div>`).join('');
}

function lbFormat(metric, row) {
  const v = row[metric.field];
  if (metric.id === 'bestTime') return `${Number(v) < 1 ? Number(v).toFixed(3) : Number(v).toFixed(2)}`;
  return Number(v || 0).toLocaleString();
}

function lbRowHtml(r, rank, metric, meId) {
  const me = r.userId === meId;
  const name = escapeHtml(r.displayName || r.username);
  return `
    <div class="lb-row ${me ? 'me' : ''}">
      <div class="lb-rank">${rank}</div>
      <img class="lb-av" src="${escapeHtml(r.avatarSrc || './imgs/assets/default_avatar.png')}" alt="" loading="lazy" decoding="async"/>
      <div class="lb-who"><b>${name}${me ? ' <em>YOU</em>' : ''}</b><small>@${escapeHtml(r.username)}</small></div>
      <div class="lb-val"><b>${lbFormat(metric, r)}</b><small>${metric.unit}</small></div>
    </div>`;
}

function lbPodiumHtml(top, metric, meId) {
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const shownRanks = [2, 1, 3];
  const groups = shownRanks.map(rank => {
    const tied = top.filter(entry => entry.rank === rank);
    if (!tied.length) return `<div class="lb-pod empty p${rank}" aria-hidden="true"></div>`;
    const val = lbFormat(metric, tied[0].row);
    const people = tied.map(entry => {
      const r = entry.row;
      return `<div class="lb-pod-user ${r.userId === meId ? 'me' : ''}">
        <img src="${escapeHtml(r.avatarSrc || './imgs/assets/default_avatar.png')}" alt="" loading="lazy" decoding="async"/>
        <b class="lb-pod-name">${escapeHtml(r.displayName || r.username)}${r.userId === meId ? ' <em>YOU</em>' : ''}</b>
      </div>`;
    }).join('');
    return `<div class="lb-pod p${rank} ${tied.some(entry => entry.row.userId === meId) ? 'me' : ''}">
      <span class="lb-pod-medal">${medal[rank]}</span>
      <div class="lb-pod-users">${people}</div>
      <span class="lb-pod-val">${val} <small>${metric.unit}</small></span>
    </div>`;
  });
  return `<div class="lb-podium">${groups.join('')}</div>`;
}

async function renderLeaderboard(forceRefresh = false) {
  const menuHost = document.getElementById('lbMenuHost');
  if (menuHost) renderLeaderboardMenu(menuHost);
  const host = document.getElementById('leaderboardList');
  const rankBar = document.getElementById('leaderboardMyRank');
  if (!host) return;
  const token = ++LB_LOAD_TOKEN;
  const { metric } = lbFindMetric(LEADERBOARD_MODE);
  const spin = document.getElementById('lbRefreshIcon');
  if (rankBar) { rankBar.classList.add('hidden'); rankBar.innerHTML = ''; }

  let rows = LB_CACHE.rows;
  const stale = !rows || forceRefresh || (Date.now() - LB_CACHE.at) > LB_CACHE_MS;
  if (stale) {
    host.innerHTML = `<div class="lb-skel-wrap">${lbSkeleton()}</div>`;
    if (spin) spin.classList.add('fa-spin');
    try {
      rows = db ? await fetchLeaderboardRowsFromDb() : fetchLeaderboardRowsFromLocal();
      LB_CACHE = { rows, at: Date.now() };
    } catch (e) {
      console.warn('[Leaderboard] load failed', e);
      if (token === LB_LOAD_TOKEN) host.innerHTML = `<div class="lb-empty"><i class="fas fa-triangle-exclamation"></i><b>Couldn't load rankings</b><small>Check your connection and tap refresh.</small></div>`;
      if (spin) spin.classList.remove('fa-spin');
      return;
    }
    if (spin) spin.classList.remove('fa-spin');
  }
  if (token !== LB_LOAD_TOKEN) return;

  const meId = currentUser?.id;
  const valid = rows.filter(r => {
    const v = r[metric.field];
    return v != null && isFinite(v) && Number(v) > 0;
  });
  valid.sort((a, b) => {
    const av = Number(a[metric.field]), bv = Number(b[metric.field]);
    if (av === bv) return String(a.userId).localeCompare(String(b.userId));
    return metric.asc ? av - bv : bv - av;
  });
  if (!valid.length) {
    host.innerHTML = `<div class="lb-empty"><i class="fas fa-trophy"></i><b>No scores yet</b><small>Be the first to land on this board!</small></div>`;
    if (rankBar) {
      rankBar.innerHTML = '<span>Your rank</span><b>—</b><span>Play a run to appear on this board</span>';
      rankBar.classList.remove('hidden');
    }
    return;
  }

  let rank = 0, prev = Symbol('unranked');
  const allRanked = valid.map((row, i) => {
    const value = Number(row[metric.field]);
    if (i === 0 || value !== prev) rank = i + 1;
    prev = value;
    return { row, rank };
  });
  const top50 = allRanked.slice(0, 50);
  const podium = top50.filter(entry => entry.rank <= 3);
  const podiumUsers = new Set(podium.map(entry => entry.row.userId));
  const rest = top50.filter(entry => !podiumUsers.has(entry.row.userId));
  const mine = allRanked.find(entry => entry.row.userId === meId);

  host.classList.remove('lb-animate-in');
  host.innerHTML = `
    ${podium.length ? lbPodiumHtml(podium, metric, meId) : `<div class="lb-podium"><div class="lb-pod empty p2"></div><div class="lb-pod empty p1"></div><div class="lb-pod empty p3"></div></div>`}
    <div class="lb-list">${rest.map(entry => lbRowHtml(entry.row, entry.rank, metric, meId)).join('')}</div>`;
  requestAnimationFrame(() => {
    if (token !== LB_LOAD_TOKEN) return;
    host.classList.add('lb-animate-in');
    setTimeout(() => host.classList.remove('lb-animate-in'), 420);
  });
  if (rankBar) {
    if (mine) rankBar.innerHTML = `<span>Your rank</span><b>#${mine.rank.toLocaleString()}</b><span>${lbFormat(metric, mine.row)} ${metric.unit}${mine.rank > 50 ? ' · outside Top 50' : ''}</span>`;
    else rankBar.innerHTML = '<span>Your rank</span><b>—</b><span>Play a run to appear on this board</span>';
    rankBar.classList.remove('hidden');
  }
}

function renderHub() {
  ensureDailyResetIfNeeded();
  document.getElementById('hubUserName').textContent = currentUser?.displayName || "Carat";
  document.getElementById('hubLevel').textContent = GAME_STATE.level;
  document.getElementById('hubCoins').textContent = formatNumber(GAME_STATE.coins);
  document.getElementById('gameCoins').textContent = formatNumber(GAME_STATE.coins);
  const qc = document.getElementById('questsCoins');
  if (qc) qc.textContent = formatNumber(GAME_STATE.coins);
  const ic = document.getElementById('idolsCoins');
  if (ic) ic.textContent = formatNumber(GAME_STATE.coins);
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) shopCoins.textContent = formatNumber(GAME_STATE.coins);
  ['hubGems', 'idolsGems', 'shopGems'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = formatNumber(GAME_STATE.gems); });
  ['hubDiamonds', 'idolsDiamonds', 'shopDiamonds'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = formatNumber(GAME_STATE.diamonds); });
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