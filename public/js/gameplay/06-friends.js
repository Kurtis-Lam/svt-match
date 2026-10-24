function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

async function findUserByUsername(username) {
  const u = normalizeUsername(username);
  if (!u) return null;
  if (db) {
    const res = await svtApi('/api/game/find-user?u=' + encodeURIComponent(u));
    if (!res || !res.found || !res.user) return null;
    const id = res.user.id;
    const snap = await db.ref(`users/${id}`).once('value');
    return {
      ...(snap.val() || res.user),
      id
    };
  } else {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const key = Object.keys(users).find(k => normalizeUsername(users[k].username) === u);
    if (!key) return null;
    return {
      ...users[key],
      id: users[key].id || key
    };
  }
}

// One shared read per user node, de-duplicated while in flight and cached
// briefly, so "does it exist?" and "friend meta" never download it twice.
const __userNodeCache = new Map(); // uid -> { at, promise }
function fetchUserNodeCached(userId, maxAgeMs = 0) {
  const hit = __userNodeCache.get(userId);
  if (hit && (Date.now() - hit.at) <= maxAgeMs) return hit.promise;
  const promise = db.ref(`users/${userId}`).once('value').then(s => s.val());
  __userNodeCache.set(userId, { at: Date.now(), promise });
  promise.catch(() => __userNodeCache.delete(userId));
  return promise;
}

async function userExistsById(userId) {
  if (!userId) return false;
  if (db) {
    return !!(await fetchUserNodeCached(userId, 15000));
  } else {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    return !!users[userId];
  }
}

function ensureFriendsDefaults() {
  GAME_STATE.friends ||= {
    list: [],
    incoming: [],
    outgoing: []
  };
  GAME_STATE.friends.list ||= [];
  GAME_STATE.friends.incoming ||= [];
  GAME_STATE.friends.outgoing ||= [];
}

function ensureBattlesDefaults() {
  GAME_STATE.battles ||= {
    pendingIncoming: [],
    pendingOutgoing: [],
    active: null,
    logs: [],
    seenLogIds: {}
  };
  GAME_STATE.battles.pendingIncoming ||= [];
  GAME_STATE.battles.pendingOutgoing ||= [];
  GAME_STATE.battles.logs ||= [];
  GAME_STATE.battles.seenLogIds ||= {};
  if (!('active' in GAME_STATE.battles)) GAME_STATE.battles.active = null;
  GAME_STATE.news ||= {
    seenIncomingBattleIds: {}
  };
  GAME_STATE.news.seenIncomingBattleIds ||= {};
}
// Helpers for friend requests

function reqMatchesEitherDirection(r, a, b) {
  if (!r) return false;
  return (r.fromUserId === a && r.toUserId === b) || (r.fromUserId === b && r.toUserId === a);
}

function normalizeReqArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

function upsertFriendMetaInList(list, meta) {
  const idx = list.findIndex(f => f?.userId === meta.userId);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...meta
    };
  } else {
    list.push(meta);
  }
}

function getOtherUserFromReq(req) {
  if (!currentUser) return null;
  const iAmSender = req.fromUserId === currentUser.id;
  const otherUserId = iAmSender ? req.toUserId : req.fromUserId;
  const otherUsername = iAmSender ? (req.toUsername || '') : (req.fromUsername || '');
  const otherDisplayName = iAmSender ? (req.toDisplayName || otherUsername) : (req.fromDisplayName || otherUsername);
  return {
    otherUserId,
    otherUsername,
    otherDisplayName,
    iAmSender
  };
}

async function getPlayerStateByUserId(userId, maxAgeMs = 0) {
  if (!userId) return null;
  if (db) {
    try {
      // users/{id} already contains playerState – one read instead of two
      const u = (await fetchUserNodeCached(userId, maxAgeMs)) || {};
      const ps = u.playerState || {};
      return {
        user: u,
        playerState: ps
      };
    } catch (e) {
      return null;
    }
  } else {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const u = users[userId];
    if (!u) return null;
    let ps = {};
    try {
      ps = JSON.parse(localStorage.getItem(`playerState:${u.username}`) || '{}');
    } catch (e) {
      ps = {};
    }
    return {
      user: u,
      playerState: ps
    };
  }
}

function buildFriendMetaFromPs(userId, u, ps) {
  const username = u?.username || ps?.username || '';
  const displayName = u?.displayName || ps?.displayName || username || 'Friend';
  const level = Number(ps?.level || 1);
  const avatarSrc = ps?.equippedAvatarKey ? `/imgs/assets/avatars/${ps.equippedAvatarKey}` : (ps?.equippedIdolKey ? `/imgs/${ps.equippedIdolKey}/1.jpg` : '/imgs/assets/default_avatar.png');
  const spotlightLevel = Number(ps?.spotlightLevel || 0);
  const snakeventeenLevel = Number(ps?.snakeventeenLevel || 0);
  // ── NEW: total love level ─────────────────────────
  const married = ps?.marriedIdols || {};
  const love = ps?.love || {};
  let totalLoveLevel = 0;
  Object.keys(married).forEach(k => {
    if (married[k]) totalLoveLevel += Number(love[k]?.level || 1);  // BUG-G12: already correct — confirmed
  });
  // ─────────────────────────────────────────────────
  return {
    userId,
    username,
    displayName,
    level,
    avatarSrc,
    totalLoveLevel,
    spotlightLevel,
    snakeventeenLevel
  };
}

function upsertMyFriendList(meta) {
  ensureFriendsDefaults();
  GAME_STATE.friends.list ||= [];
  upsertFriendMetaInList(GAME_STATE.friends.list, meta);
}
// Periodic refresh for friend levels/avatars
let __friendsMetaRefresh = null;

// ── REALTIME SYNC ───────────────────────────────────────────────────────
// Firebase .on('value') listeners so admin-panel edits and remote changes
// propagate to the app instantly without any polling delay.
let __realtimeListeners = {}; // { refPath: offFn }

function _attachRealtimeListener(path, handler) {
  if (!db) return;
  // Detach any existing listener on this path first
  if (__realtimeListeners[path]) {
    __realtimeListeners[path]();
    delete __realtimeListeners[path];
  }
  const ref = db.ref(path);
  ref.on('value', handler);
  __realtimeListeners[path] = () => ref.off('value', handler);
}

function stopAllRealtimeListeners() {
  Object.values(__realtimeListeners).forEach(off => off());
  __realtimeListeners = {};
}

let __realtimeIgnoreNextLocal = false; // suppress echo of our own writes

function startRealtimeSync() {
  if (!currentUser?.id || !db) return;
  const uid = currentUser.id;

  // 1) Player state (coins, level, streaks, daily, quests, battles, friends…)
  let __firstPlayerStateEvent = true;
  _attachRealtimeListener(`users/${uid}/playerState`, async (snap) => {
    // The first event just echoes the state we loaded/saved a moment ago.
    if (__firstPlayerStateEvent) { __firstPlayerStateEvent = false; return; }
    if (__realtimeIgnoreNextLocal) { __realtimeIgnoreNextLocal = false; return; }
    const payload = snap.val();
    if (!payload) return;
    // Don't clobber an in-progress level
    if (GAME_STATE.inLevel) return;
    applyLoadedPlayerState(payload);
    try { Meta.afterRemoteApply(); } catch (e) { console.warn('[Meta]', e); }
    savePlayerStateLocal();
    ensureDailyResetIfNeeded();
    ensureAllQuests();
    hydrateQuestProgressFromStats();
    renderHub();
    updateDailyWinsUI();
    updateDailyDrawUI();
    updateQuestBadges();
    updateNewsBadge();
    if (!document.getElementById('friendsScreen')?.classList.contains('hidden')) renderFriends();
  });

  // 2) Friend requests (incoming + outgoing) for instant badge/list updates
  _attachRealtimeListener(`users/${uid}/friendRequests/incoming`, (snap) => {
    const data = snap.val() || {};
    GAME_STATE.friends.incoming = Object.values(data);
    if (!document.getElementById('friendsScreen')?.classList.contains('hidden')) renderFriends();
    updateNewsBadge();
  });

  _attachRealtimeListener(`users/${uid}/friendRequests/outgoing`, (snap) => {
    const data = snap.val() || {};
    GAME_STATE.friends.outgoing = Object.values(data);
    if (!document.getElementById('friendsScreen')?.classList.contains('hidden')) renderFriends();
  });

  // 3) Battle requests – pendingIncoming updated remotely (opponent sends challenge)
  _attachRealtimeListener(`users/${uid}/playerState/battles/pendingIncoming`, (snap) => {
    const data = snap.val();
    if (!data) return;
    const incoming = Array.isArray(data) ? data : Object.values(data);
    GAME_STATE.battles.pendingIncoming = incoming;
    updateNewsBadge();
    if (!document.getElementById('friendsScreen')?.classList.contains('hidden')) renderFriends();
  });
}

function stopRealtimeSync() {
  stopAllRealtimeListeners();
}
// ── END REALTIME SYNC ───────────────────────────────────────────────────

async function refreshAllFriendsMeta(saveAfter = false) {
  ensureFriendsDefaults();
  const list = GAME_STATE.friends.list || [];
  if (!list.length) return;
  const updates = await Promise.all(list.map(async f => {
    const data = await getPlayerStateByUserId(f.userId, 15000);
    if (!data) return null;
    return buildFriendMetaFromPs(f.userId, data.user, data.playerState);
  }));
  let changed = false;
  updates.forEach((m, i) => {
    if (!m) return;
    const old = GAME_STATE.friends.list[i];
    if (!old || old.level !== m.level || old.avatarSrc !== m.avatarSrc || old.displayName !== m.displayName || old.spotlightLevel !== m.spotlightLevel || old.snakeventeenLevel !== m.snakeventeenLevel
      // optional: also totalLoveLevel
      || old.totalLoveLevel !== m.totalLoveLevel) {
      GAME_STATE.friends.list[i] = {
        ...old,
        ...m
      };
      changed = true;
    }
  });
  if (changed && saveAfter) await savePlayerState();
}

function startFriendsMetaRefresh() {
  stopFriendsMetaRefresh();
  // Realtime listeners handle instant data sync.
  // This poll only refreshes friend avatars/levels (metadata not in playerState listener).
  __friendsMetaRefresh = setInterval(async () => {
    if (!currentUser) return;
    await reloadMyFriendsFromDbOrLocal();
    await refreshAllFriendsMeta(true);
    if (!document.getElementById('friendsScreen')?.classList.contains('hidden')) {
      renderFriends();
    }
  }, 30000); // reduced to 30s since realtime handles structural changes instantly
}

function stopFriendsMetaRefresh() {
  if (__friendsMetaRefresh) clearInterval(__friendsMetaRefresh);
  __friendsMetaRefresh = null;
}

async function openFriends() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  renderHub();
  FRIENDS_TAB = "all";
  clearFriendsBadges();
  // Data is already preloaded at startup, no need to fetch again.
  // (You may still call refreshAllFriendsMeta if you want the latest avatars/levels,
  //  but it should be fast because the core list is cached.)
  renderFriends();
  startFriendsMetaRefresh();
  showScreen('friendsScreen');
}
let FRIENDS_TAB = "all";

function clearFriendsBadges() {
  const badgeBtn = document.getElementById('friendsPendingBadgeBtn');
  if (badgeBtn) {
    setBadgeVisibility(badgeBtn, 0); // forces style.display = 'none'
  }
}

function toggleFriendsTab() {
  FRIENDS_TAB = (FRIENDS_TAB === 'all') ? 'pending' : 'all';
  renderFriends();
}

async function cleanupDeletedUsersFromFriendsAndBattles() {
  ensureFriendsDefaults();
  ensureBattlesDefaults();
  const before = JSON.stringify({
    friendsList: GAME_STATE.friends.list || [],
    friendsIncoming: GAME_STATE.friends.incoming || [],
    friendsOutgoing: GAME_STATE.friends.outgoing || [],
    battlesIncoming: GAME_STATE.battles.pendingIncoming || [],
    battlesOutgoing: GAME_STATE.battles.pendingOutgoing || []
  });
  const friendIds = [...new Set((GAME_STATE.friends.list || []).map(f => f.userId).filter(Boolean))];
  const existing = {};
  await Promise.all(friendIds.map(async id => { existing[id] = await userExistsById(id); }));
  GAME_STATE.friends.list = (GAME_STATE.friends.list || []).filter(f => existing[f.userId]);
  const inc = normalizeReqArray(GAME_STATE.friends.incoming || []);
  const out = normalizeReqArray(GAME_STATE.friends.outgoing || []);
  // P-01 FIX: request senders/recipients are NOT in friends.list yet,
  // so we must check their existence separately before filtering.
  const _reqPeers = [
    ...new Set([
      ...inc.map(r => r.fromUserId),
      ...out.map(r => r.toUserId),
    ].filter(Boolean))
  ];
  await Promise.all(_reqPeers.filter(p => !(p in existing)).map(async _pid => { existing[_pid] = await userExistsById(_pid); }));
  // Only remove entries whose peer is CONFIRMED gone (=== false).
  // undefined means "not checked" – keep those.
  GAME_STATE.friends.incoming = inc.filter(
    r => r.fromUserId && r.toUserId && existing[r.fromUserId] !== false);
  GAME_STATE.friends.outgoing = out.filter(
    r => r.fromUserId && r.toUserId && existing[r.toUserId] !== false);
  const bIds = new Set();
  (GAME_STATE.battles.pendingIncoming || []).forEach(b => {
    if (b.fromUserId) bIds.add(b.fromUserId);
    if (b.toUserId) bIds.add(b.toUserId);
  });
  (GAME_STATE.battles.pendingOutgoing || []).forEach(b => {
    if (b.fromUserId) bIds.add(b.fromUserId);
    if (b.toUserId) bIds.add(b.toUserId);
  });
  await Promise.all([...bIds].filter(id => existing[id] === undefined).map(async id => { existing[id] = await userExistsById(id); }));
  // P-08 FIX: only drop battle entries CONFIRMED deleted (=== false)
  GAME_STATE.battles.pendingIncoming = (GAME_STATE.battles.pendingIncoming || []).filter(
    b => existing[b.fromUserId] !== false && existing[b.toUserId] !== false);
  GAME_STATE.battles.pendingOutgoing = (GAME_STATE.battles.pendingOutgoing || []).filter(
    b => existing[b.fromUserId] !== false && existing[b.toUserId] !== false);
  const after = JSON.stringify({
    friendsList: GAME_STATE.friends.list || [],
    friendsIncoming: GAME_STATE.friends.incoming || [],
    friendsOutgoing: GAME_STATE.friends.outgoing || [],
    battlesIncoming: GAME_STATE.battles.pendingIncoming || [],
    battlesOutgoing: GAME_STATE.battles.pendingOutgoing || []
  });
  // IMPORTANT: do not always save stale state; only save when there was an actual cleanup change
  if (before !== after) {
    await savePlayerState();
  }
}

async function renderFriends() {
  ensureFriendsDefaults();
  // Pull newest friend data before any render cleanup/write
  await reloadMyFriendsFromDbOrLocal();
  await cleanupDeletedUsersFromFriendsAndBattles();
  // Always refresh meta before drawing
  await refreshAllFriendsMeta(true);
  const allWrap = document.getElementById('friendsAllWrap');
  const pendingWrap = document.getElementById('friendsPendingWrap');
  const btnLabel = document.getElementById('friendsTabBtnLabel');
  if (!allWrap || !pendingWrap || !btnLabel) return;
  if (FRIENDS_TAB === "all") {
    allWrap.classList.remove('hidden');
    pendingWrap.classList.add('hidden');
    btnLabel.textContent = "Pending";
  } else {
    allWrap.classList.add('hidden');
    pendingWrap.classList.remove('hidden');
    btnLabel.textContent = "All Friends";
  }
  const allList = document.getElementById('friendsAllList');
  const incomingList = document.getElementById('friendsIncomingList');
  const outgoingList = document.getElementById('friendsOutgoingList');
  allList.innerHTML = "";
  incomingList.innerHTML = "";
  outgoingList.innerHTML = "";
  document.getElementById('friendsCountLabel').textContent = String((GAME_STATE.friends.list || []).length);
  if ((GAME_STATE.friends.list || []).length === 0) {
    allList.innerHTML = `<div class="glass-card rounded-2xl p-4 text-sm text-gray-600 col-span-1">No friends yet. Tap “Add Friends”.</div>`;
  } else {
    GAME_STATE.friends.list.slice().sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || ""))).forEach(f => {
      const row = document.createElement('div');
      row.className = "glass-card rounded-2xl p-4 flex items-center justify-between gap-3";
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <img class="avatar-sm" src="${f.avatarSrc || '/imgs/assets/default_avatar.png'}" alt="avatar"/>
          <div class="min-w-0">
            <div class="font-extrabold text-gray-900 truncate">${escapeHtml(f.displayName || f.username)}</div>
            <div class="text-xs text-gray-500 font-bold truncate">@${escapeHtml(f.username || '')}</div>
          </div>
        </div>
      `;
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e) => {
        // Remove any existing profile popups
        document.querySelectorAll('.friend-profile-popup').forEach(p => p.remove());
        const appRect = document.getElementById('app').getBoundingClientRect();
        const x = e.clientX - appRect.left;
        const y = e.clientY - appRect.top;
        const btnW = 110;
        const left = (x + btnW + 16 > appRect.width - 8) ? x - btnW - 8 : x + 10;
        const popup = document.createElement('div');
        popup.className = 'friend-profile-popup';
        popup.style.cssText = `
          position:absolute; left:${left}px; top:${Math.max(60, y - 30)}px;
          background:rgba(255,255,255,0.97);
          border:1px solid rgba(148,163,184,0.3);
          border-radius:18px;
          box-shadow:0 16px 40px rgba(0,0,0,0.18);
          z-index:300; pointer-events:auto;
          overflow:hidden;
          animation:dropIn 0.18s ease-out both;
          min-width:130px;
        `;
        popup.innerHTML = `
          <button onclick=""
            style="
              display:flex;align-items:center;gap:10px;
              width:100%;padding:12px 14px;
              background:transparent;border:none;
              cursor:pointer;text-align:left;
              font-weight:900;font-size:13px;color:#0f172a;
            "
            id="profilePopupBtn"
          >
            <div style="
              width:30px;height:30px;border-radius:9px;
              background:linear-gradient(135deg,var(--theme1),var(--theme2));
              display:flex;align-items:center;justify-content:center;
              flex:0 0 30px;
            ">
              <i class='fas fa-user' style='color:#0f172a;font-size:12px;'></i>
            </div>
            View Profile
          </button>
        `;
        popup.querySelector('#profilePopupBtn').onclick = (ev) => {
          ev.stopPropagation();
          popup.remove();
          openProfileModal(f.userId);
        };
        document.getElementById('friendsScreen').appendChild(popup);
        const dismiss = () => {
          popup.remove();
          document.removeEventListener('click', dismiss);
        };
        setTimeout(() => document.addEventListener('click', dismiss, {
          once: true
        }), 60);
      });
      allList.appendChild(row);
    });
  }
  // [FRIENDS-FIX]: Pending view now shows two lists — incoming and outgoing.
  // Incoming: requests others sent TO me
  const pendingsInc = normalizeReqArray(GAME_STATE.friends.incoming || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (pendingsInc.length === 0) {
    incomingList.innerHTML = `<div class="text-sm text-gray-600 font-semibold">No incoming requests.</div>`;
  } else {
    for (const req of pendingsInc) {
      const other = {
        id: req.fromUserId,
        username: req.fromUsername,
        displayName: req.fromDisplayName
      };
      // Try to refresh avatar from latest PS (BUG-S04: equippedAvatarKey takes priority)
      let avatarSrc = req.fromAvatarSrc || '/imgs/assets/default_avatar.png';
      const data = await getPlayerStateByUserId(other.id);
      if (data?.playerState?.equippedAvatarKey) avatarSrc = `/imgs/assets/avatars/${data.playerState.equippedAvatarKey}`;
      else if (data?.playerState?.equippedIdolKey) avatarSrc = `/imgs/${data.playerState.equippedIdolKey}/1.jpg`;
      const row = document.createElement('div');
      row.className = "friend-pending-row p-4 flex items-center justify-between gap-3";
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <img class="avatar-sm" src="${avatarSrc}" alt="avatar"/>
          <div class="min-w-0">
            <div class="font-extrabold text-gray-900 truncate">${escapeHtml(other.displayName || other.username)}</div>
            <div class="text-xs text-gray-600 font-bold truncate">@${escapeHtml(other.username || '')}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="glass-card w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-100" onclick="acceptFriendRequest('${req.id}')">
            <i class="fas fa-check text-emerald-600"></i>
          </button>
          <button class="glass-card w-10 h-10 rounded-2xl flex items-center justify-center bg-red-100" onclick="rejectFriendRequest('${req.id}')">
            <i class="fas fa-xmark text-red-600"></i>
          </button>
        </div>
      `;
      incomingList.appendChild(row);
    }
  }
  // Outgoing: requests I sent to others
  const pendingsOut = normalizeReqArray(GAME_STATE.friends.outgoing || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (pendingsOut.length === 0) {
    outgoingList.innerHTML = `<div class="text-sm text-gray-600 font-semibold">No outgoing requests.</div>`;
  } else {
    for (const req of pendingsOut) {
      const other = {
        id: req.toUserId,
        username: req.toUsername,
        displayName: req.toDisplayName
      };
      // Try avatar (BUG-S04 pattern: check equippedAvatarKey first)
      let avatarSrc = '/imgs/assets/default_avatar.png';
      const data = await getPlayerStateByUserId(other.id);
      if (data?.playerState?.equippedAvatarKey) avatarSrc = `/imgs/assets/avatars/${data.playerState.equippedAvatarKey}`;
      else if (data?.playerState?.equippedIdolKey) avatarSrc = `/imgs/${data.playerState.equippedIdolKey}/1.jpg`;
      const row = document.createElement('div');
      row.className = "friend-outgoing-row p-4 flex items-center justify-between gap-3";  // BUG-F01: was friend-pending-row
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <img class="avatar-sm" src="${avatarSrc}" alt="avatar"/>
          <div class="min-w-0">
            <div class="font-extrabold text-gray-900 truncate">${escapeHtml(other.displayName || other.username)}</div>
            <div class="text-xs text-gray-600 font-bold truncate">@${escapeHtml(other.username || '')}</div>
          </div>
        </div>
        <div class="text-right text-xs font-extrabold text-gray-500">Pending</div>
      `;
      outgoingList.appendChild(row);
    }
  }
  updateFriendsBadges();
}

function openAddFriendsModal() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  openModal("Add Friends", `
    <div id="modalError" class="modal-error" aria-live="polite"></div>
    <div class="space-y-3">
      <div>
        <label class="text-sm text-gray-600 font-medium ml-1">Friend's Username</label>
        <div class="relative mt-1">
          <i class="fas fa-at absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input type="text" id="addFriendUsername" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="their_username" />
        </div>
        <p class="text-[11px] text-gray-500 font-semibold mt-2">Usernames are lowercase.</p>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-3">
        <button class="glass-card py-4 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Cancel</button>
        <button class="btn-theme black-text" onclick="submitAddFriend()">Send Request</button>
      </div>
    </div>
  `);
  setTimeout(() => setModalError(''), 0);
}

async function submitAddFriend() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  ensureFriendsDefaults();
  // Ensure we have the latest state
  await reloadMyFriendsFromDbOrLocal();
  const input = document.getElementById('addFriendUsername');
  const toUsername = normalizeUsername(input?.value || '');
  if (!toUsername) {
    setModalError('Enter a username.');
    return;
  }
  if (toUsername === normalizeUsername(currentUser.username)) {
    setModalError('You cannot add yourself.');
    return;
  }
  const target = await findUserByUsername(toUsername);
  if (!target || !target.id) {
    setModalError('User not found.');
    return;
  }
  // Already friends?
  const alreadyFriend = normalizeReqArray(GAME_STATE.friends.list || []).some(f => f.userId === target.id);
  if (alreadyFriend) {
    setModalError('Already friends.');
    return;
  }
  // S-08 FIX (confirmed present): Check existing pending requests (both sides)
  // Prevents duplicate outgoing requests to the same user.
  const myInc = normalizeReqArray(GAME_STATE.friends.incoming || []);
  const myOut = normalizeReqArray(GAME_STATE.friends.outgoing || []);
  if (myOut.some(r => reqMatchesEitherDirection(r, currentUser.id, target.id)) ||
      myInc.some(r => reqMatchesEitherDirection(r, currentUser.id, target.id))) {
    setModalError('Request already pending.');
    return;
  }

  const reqId = `fr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const req = {
    id: reqId,
    fromUserId: currentUser.id,
    fromUsername: currentUser.username,
    fromDisplayName: currentUser.displayName || currentUser.username,
    fromAvatarSrc: equippedAvatarSrc(),
    toUserId: target.id,
    toUsername: target.username,
    toDisplayName: target.displayName || target.username,
    createdAt: Date.now()
  };

  if (db) {
    try {
      // 1. Write to sender's outgoing (inside friendRequests)
      await db.ref(`users/${currentUser.id}/friendRequests/outgoing/${reqId}`).set(req);
      // 2. Write to recipient's incoming (inside friendRequests)
      await db.ref(`users/${target.id}/friendRequests/incoming/${reqId}`).set(req);

      // Update local GAME_STATE optimistically (optional, but improves UI)
      if (!GAME_STATE.friends.outgoing) GAME_STATE.friends.outgoing = [];
      GAME_STATE.friends.outgoing.push(req);
      await savePlayerState(); // persist locally

      closeModal();
      showToast('Request sent!', 'success');
      await reloadMyFriendsFromDbOrLocal(); // refresh from DB to be safe
      renderFriends();
    } catch (error) {
      console.error('submitAddFriend error:', error);
      setModalError('Failed to send request. Please try again.');
    }
  } else {
    // --- localStorage fallback (kept for offline/local-only mode) ---
    // Write to both users' localStorage
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const currentKey = `playerState:${currentUser.username}`;
    let myPS = JSON.parse(localStorage.getItem(currentKey) || '{}');
    myPS.friends = myPS.friends || { list: [], incoming: [], outgoing: [] };
    myPS.friends.outgoing = myPS.friends.outgoing || [];
    myPS.friends.outgoing.push(req);
    localStorage.setItem(currentKey, JSON.stringify(myPS));

    const targetUser = users[target.id];
    if (targetUser) {
      const targetKey = `playerState:${targetUser.username}`;
      let targetPS = JSON.parse(localStorage.getItem(targetKey) || '{}');
      targetPS.friends = targetPS.friends || { list: [], incoming: [], outgoing: [] };
      targetPS.friends.incoming = targetPS.friends.incoming || [];
      targetPS.friends.incoming.push(req);
      localStorage.setItem(targetKey, JSON.stringify(targetPS));
    }

    // Update local GAME_STATE
    GAME_STATE.friends.outgoing = GAME_STATE.friends.outgoing || [];
    GAME_STATE.friends.outgoing.push(req);
    await savePlayerState();

    closeModal();
    showToast('Request sent!', 'success');
    await reloadMyFriendsFromDbOrLocal(); // sync from localStorage
    renderFriends();
  }
}

function updateFriendsBadges() {
  const pendingIncoming = (GAME_STATE.friends?.incoming || []).length;
  const badgeBtn = document.getElementById('friendsPendingBadgeBtn');
  if (badgeBtn) {
    setBadgeVisibility(badgeBtn, pendingIncoming);
  }
  updateCliqueBadge();
}

async function acceptFriendRequest(reqId) {
  if (!currentUser) return;
  ensureFriendsDefaults();
  await reloadMyFriendsFromDbOrLocal();

  // Find the request in my incoming list
  const idx = (GAME_STATE.friends.incoming || []).findIndex(r => r.id === reqId);
  if (idx === -1) {
    showToast('Request not found', 'error');
    return;
  }
  const req = GAME_STATE.friends.incoming[idx];
  const otherUserId = req.fromUserId;

  // Safety: ensure the other user still exists
  if (!(await userExistsById(otherUserId))) {
    // Remove stale request from my incoming
    GAME_STATE.friends.incoming.splice(idx, 1);
    if (db) {
      await db.ref(`users/${currentUser.id}/friendRequests/incoming/${reqId}`).remove();
    } else {
      await savePlayerState();
    }
    showToast('User no longer exists', 'error');
    renderFriends();
    return;
  }

  try {
    if (db) {
      const accepted = await svtApi('/api/game/friend-accept', { body: { reqId } });
      const myList = Array.isArray(accepted && accepted.list) ? accepted.list : [];

      // Also update local state
      GAME_STATE.friends.list = myList;
      GAME_STATE.friends.incoming = GAME_STATE.friends.incoming.filter(r => r.id !== reqId);
      GAME_STATE.friends.outgoing = GAME_STATE.friends.outgoing.filter(r => r.id !== reqId);

      await savePlayerState();
      showToast('Friend added!', 'success');
    } else {
      // --- localStorage fallback ---
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      const myKey = `playerState:${currentUser.username}`;
      let myPS = JSON.parse(localStorage.getItem(myKey) || '{}');
      myPS.friends = myPS.friends || { list: [], incoming: [], outgoing: [] };
      myPS.friends.incoming = (myPS.friends.incoming || []).filter(r => r.id !== reqId);
      myPS.friends.list = (myPS.friends.list || []).filter(f => f.userId !== otherUserId);
      myPS.friends.list.push(otherMeta);
      localStorage.setItem(myKey, JSON.stringify(myPS));

      const otherUserRow = users[otherUserId];
      if (otherUserRow) {
        const otherKey = `playerState:${otherUserRow.username}`;
        let otherPS = JSON.parse(localStorage.getItem(otherKey) || '{}');
        otherPS.friends = otherPS.friends || { list: [], incoming: [], outgoing: [] };
        otherPS.friends.outgoing = (otherPS.friends.outgoing || []).filter(r => r.id !== reqId);
        otherPS.friends.list = (otherPS.friends.list || []).filter(f => f.userId !== currentUser.id);
        otherPS.friends.list.push(meMeta);
        localStorage.setItem(otherKey, JSON.stringify(otherPS));
      }

      // Update global state
      GAME_STATE.friends.list = (GAME_STATE.friends.list || []).filter(f => f.userId !== otherUserId);
      GAME_STATE.friends.list.push(otherMeta);
      GAME_STATE.friends.incoming = (GAME_STATE.friends.incoming || []).filter(r => r.id !== reqId);
      GAME_STATE.friends.outgoing = (GAME_STATE.friends.outgoing || []).filter(r => r.id !== reqId);
      await savePlayerState();

      showToast('Friend added!', 'success');
    }

    await reloadMyFriendsFromDbOrLocal();
    renderFriends();
  } catch (e) {
    console.error('acceptFriendRequest failed', e);
    showToast('Failed to accept request. Try again.', 'error');
  }
}

async function reloadMyFriendsFromDbOrLocal() {
  if (!currentUser) return;
  ensureFriendsDefaults();

  if (db && currentUser?.id) {
    try {
      // Read from the new dedicated friendRequests nodes
      const [incomingSnap, outgoingSnap, listSnap] = await Promise.all([
        db.ref(`users/${currentUser.id}/friendRequests/incoming`).once('value'),
        db.ref(`users/${currentUser.id}/friendRequests/outgoing`).once('value'),
        // Friends list remains under playerState (only the owner can write there)
        db.ref(`users/${currentUser.id}/playerState/friends/list`).once('value')
      ]);

      // Convert objects to arrays (in case they are stored as objects keyed by request ID)
      let incoming = incomingSnap.val();
      let outgoing = outgoingSnap.val();
      let list = listSnap.val();

      GAME_STATE.friends.incoming = incoming ? Object.values(incoming) : [];
      GAME_STATE.friends.outgoing = outgoing ? Object.values(outgoing) : [];
      GAME_STATE.friends.list = list ? (Array.isArray(list) ? list : Object.values(list)) : [];

      // Normalise each entry to an array format (ensures consistent structure)
      GAME_STATE.friends.incoming = normalizeReqArray(GAME_STATE.friends.incoming);
      GAME_STATE.friends.outgoing = normalizeReqArray(GAME_STATE.friends.outgoing);
      GAME_STATE.friends.list = normalizeReqArray(GAME_STATE.friends.list);

      return;
    } catch (e) {
      console.error('reloadMyFriendsFromDbOrLocal error', e);
      // Fall through to localStorage fallback
    }
  }

  // --- localStorage fallback (offline / local‑only mode) ---
  try {
    const key = `playerState:${currentUser.username}`;
    const ps = JSON.parse(localStorage.getItem(key) || '{}');
    const f = ps?.friends || {};
    // For localStorage, we still use the old structure (or you could mirror the new one)
    // To keep it simple, read from the old locations:
    GAME_STATE.friends.list = normalizeReqArray(f.list);
    GAME_STATE.friends.incoming = normalizeReqArray(f.incoming);
    GAME_STATE.friends.outgoing = normalizeReqArray(f.outgoing);
  } catch (e) {
    console.warn('localStorage friends load failed', e);
  }
}

async function writeAcceptFriendToOtherUser_Standard(otherUserId, originalReq) {
  if (!otherUserId || !currentUser) return;
  const meId = currentUser.id;
  const meMeta = {
    userId: meId,
    username: currentUser.username,
    displayName: currentUser.displayName || currentUser.username,
    level: Number(GAME_STATE.level || 1),
    avatarSrc: equippedAvatarSrc()
  };
  // Build other meta (fallback to request fields)
  const otherData = await getPlayerStateByUserId(otherUserId);
  const otherPs = otherData?.playerState || {};
  const otherUser = otherData?.user || {};
  const otherMeta = {
    userId: otherUserId,
    username: otherUser?.username || originalReq?.fromUsername || '',
    displayName: otherUser?.displayName || otherPs?.displayName || originalReq?.fromDisplayName || originalReq?.fromUsername || 'Friend',
    level: Number(otherPs?.level || 1),
    avatarSrc: otherPs?.equippedIdolKey ? `/imgs/${otherPs.equippedIdolKey}/1.jpg` : (originalReq?.fromAvatarSrc || '/imgs/assets/default_avatar.png')
  };
  if (db) {
    // Read ONLY friends subtree for both users
    const myFriendsRef = db.ref(`users/${meId}/playerState/friends`);
    const otherFriendsRef = db.ref(`users/${otherUserId}/playerState/friends`);
    const [mySnap, otherSnap] = await Promise.all([
      myFriendsRef.once('value').catch(() => null),
      otherFriendsRef.once('value').catch(() => null)
    ]);
    const myFriends = mySnap?.val() || {};
    const otherFriends = otherSnap?.val() || {};
    const myList = normalizeReqArray(myFriends.list);
    const myIncoming = normalizeReqArray(myFriends.incoming);
    const myOutgoing = normalizeReqArray(myFriends.outgoing);
    const otherList = normalizeReqArray(otherFriends.list);
    const otherIncoming = normalizeReqArray(otherFriends.incoming);
    const otherOutgoing = normalizeReqArray(otherFriends.outgoing);
    // Symmetric upsert
    upsertFriendMetaInList(myList, otherMeta);
    upsertFriendMetaInList(otherList, meMeta);
    // Remove pending pair from both sides (both queues)
    const cleanedMyIncoming = myIncoming.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    const cleanedMyOutgoing = myOutgoing.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    const cleanedOtherIncoming = otherIncoming.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    const cleanedOtherOutgoing = otherOutgoing.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    // Atomic multi-path update (do NOT overwrite full playerState)
    const updates = {};
    updates[`users/${meId}/playerState/friends`] = {
      list: myList,
      incoming: cleanedMyIncoming,
      outgoing: cleanedMyOutgoing
    };
    updates[`users/${otherUserId}/playerState/friends`] = {
      list: otherList,
      incoming: cleanedOtherIncoming,
      outgoing: cleanedOtherOutgoing
    };
    await db.ref().update(updates);
    // Keep current runtime state in sync
    GAME_STATE.friends.list = myList;
    GAME_STATE.friends.incoming = cleanedMyIncoming;
    GAME_STATE.friends.outgoing = cleanedMyOutgoing;
  } else {
    // Local fallback
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const otherUserRow = users[otherUserId];
    if (!otherUserRow) return;
    // Update other user's local state
    const otherKey = `playerState:${otherUserRow.username}`;
    let otherState = {};
    try {
      otherState = JSON.parse(localStorage.getItem(otherKey) || '{}');
    } catch (e) {
      otherState = {};
    }
    otherState.friends ||= {
      list: [],
      incoming: [],
      outgoing: []
    };
    otherState.friends.list = normalizeReqArray(otherState.friends.list);
    otherState.friends.incoming = normalizeReqArray(otherState.friends.incoming);
    otherState.friends.outgoing = normalizeReqArray(otherState.friends.outgoing);
    upsertFriendMetaInList(otherState.friends.list, meMeta);
    otherState.friends.incoming = otherState.friends.incoming.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    otherState.friends.outgoing = otherState.friends.outgoing.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    localStorage.setItem(otherKey, JSON.stringify(otherState));
    // Update my side
    GAME_STATE.friends ||= {
      list: [],
      incoming: [],
      outgoing: []
    };
    GAME_STATE.friends.list = normalizeReqArray(GAME_STATE.friends.list);
    GAME_STATE.friends.incoming = normalizeReqArray(GAME_STATE.friends.incoming);
    GAME_STATE.friends.outgoing = normalizeReqArray(GAME_STATE.friends.outgoing);
    upsertFriendMetaInList(GAME_STATE.friends.list, otherMeta);
    GAME_STATE.friends.incoming = GAME_STATE.friends.incoming.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    GAME_STATE.friends.outgoing = GAME_STATE.friends.outgoing.filter(r => !reqMatchesEitherDirection(r, meId, otherUserId));
    await savePlayerState();
  }
}

async function rejectFriendRequest(reqId) {
  if (!currentUser) return;
  ensureFriendsDefaults();
  await reloadMyFriendsFromDbOrLocal();

  const idx = (GAME_STATE.friends.incoming || []).findIndex(r => r.id === reqId);
  if (idx === -1) return;

  const req = GAME_STATE.friends.incoming[idx];
  const otherUserId = req.fromUserId;

  if (db) {
    // Remove from my incoming
    await db.ref(`users/${currentUser.id}/friendRequests/incoming/${reqId}`).remove();

    // Remove from the other user's outgoing (if it still exists)
    if (otherUserId) {
      await db.ref(`users/${otherUserId}/friendRequests/outgoing/${reqId}`).remove();
    }

    // Update local state
    GAME_STATE.friends.incoming = GAME_STATE.friends.incoming.filter(r => r.id !== reqId);
    await savePlayerState();
  } else {
    // localStorage fallback
    const myKey = `playerState:${currentUser.username}`;
    let myPS = JSON.parse(localStorage.getItem(myKey) || '{}');
    myPS.friends = myPS.friends || { list: [], incoming: [], outgoing: [] };
    myPS.friends.incoming = (myPS.friends.incoming || []).filter(r => r.id !== reqId);
    localStorage.setItem(myKey, JSON.stringify(myPS));

    if (otherUserId) {
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      const otherUser = users[otherUserId];
      if (otherUser) {
        const otherKey = `playerState:${otherUser.username}`;
        let otherPS = JSON.parse(localStorage.getItem(otherKey) || '{}');
        otherPS.friends = otherPS.friends || { list: [], incoming: [], outgoing: [] };
        otherPS.friends.outgoing = (otherPS.friends.outgoing || []).filter(r => r.id !== reqId);
        localStorage.setItem(otherKey, JSON.stringify(otherPS));
      }
    }

    GAME_STATE.friends.incoming = GAME_STATE.friends.incoming.filter(r => r.id !== reqId);
    await savePlayerState();
  }

  showToast('Request rejected', 'info');
  await reloadMyFriendsFromDbOrLocal();
  renderFriends();
}
