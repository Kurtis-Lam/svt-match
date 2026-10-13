function unseenIncomingBattlesCount() {
  ensureBattlesDefaults();
  const incoming = (GAME_STATE.battles.pendingIncoming || []).filter(b => b.status === "awaiting_accept");
  const seenMap = GAME_STATE.news?.seenIncomingBattleIds || {};
  return incoming.filter(b => !seenMap[b.id]).length;
}

function updateNewsBadge() {
  // kept for backward compat — now delegates to hamburger+panel
  updateHamburgerBadge();
  updatePanelBadges();
}

function unseenLogsCount() {
  ensureBattlesDefaults();
  return (GAME_STATE.battles.logs || []).filter(l => !GAME_STATE.battles.seenLogIds[l.id]).length;
}

function unseenRequestsCount() {
  ensureBattlesDefaults();
  const incoming = (GAME_STATE.battles.pendingIncoming || []).filter(b => b.status === "awaiting_accept");
  const seenMap = GAME_STATE.news?.seenIncomingBattleIds || {};
  return incoming.filter(b => !seenMap[b.id]).length;
}

function incomingFriendRequestsCount() {
  ensureFriendsDefaults();
  return (GAME_STATE.friends.incoming || []).length;
}

function setBadgeVisibility(el, count) {
  if (!el) return;
  if (count > 0) {
    el.textContent = String(count);
    el.classList.remove('hidden');
    el.style.display = 'flex';
  } else {
    el.textContent = '';
    el.classList.add('hidden');
    el.style.display = 'none';
  }
}

function updateHamburgerBadge() {
  const badge = document.getElementById('hamburgerBadge');
  const total = unseenRequestsCount() + unseenLogsCount();
  setBadgeVisibility(badge, total);
}

function updatePanelBadges() {
  setBadgeVisibility(document.getElementById('panelNewsBadge'), unseenRequestsCount());
  setBadgeVisibility(document.getElementById('panelLogsBadge'), unseenLogsCount());
}

function updateCliqueBadge() {
  setBadgeVisibility(document.getElementById('cliqueFriendBadge'), incomingFriendRequestsCount());
}

function markAllBattleLogsSeen() {
  ensureBattlesDefaults();
  (GAME_STATE.battles.logs || []).forEach(l => {
    GAME_STATE.battles.seenLogIds[l.id] = true;
  });
  savePlayerState();
  updateHamburgerBadge();
  updatePanelBadges();
}

function markAllIncomingBattlesSeen() {
  ensureBattlesDefaults();
  const seen = GAME_STATE.news.seenIncomingBattleIds || {};
  // Mark ALL incoming battles seen regardless of status
  (GAME_STATE.battles.pendingIncoming || []).forEach(b => {
    seen[b.id] = true;
  });
  GAME_STATE.news.seenIncomingBattleIds = seen;
  savePlayerState();
  updateHamburgerBadge();
  updatePanelBadges();
}

function openBattleLogs() {
  renderHub();
  renderBattleLogsOnly();
  showScreen('battleLogsScreen');
  markAllBattleLogsSeen();
  updatePanelBadges();
  updateHamburgerBadge();
}

async function refreshBattleLogAvatars() {
  const logHost = document.getElementById('battleLogList');
  if (!logHost) return;
  const imgs = logHost.querySelectorAll('img[data-userid]');
  const userIds = new Set();
  imgs.forEach(img => userIds.add(img.getAttribute('data-userid')));
  const avatarMap = {};
  for (const uid of userIds) {
    if (uid === currentUser?.id) {
      avatarMap[uid] = equippedAvatarSrc();
    } else {
      const data = await getPlayerStateByUserId(uid);
      if (data && data.playerState) {
        const ps = data.playerState;
        if (ps?.equippedAvatarKey) {
          avatarMap[uid] = `./imgs/assets/avatars/${ps.equippedAvatarKey}`;
        } else if (ps?.equippedIdolKey) {
          avatarMap[uid] = `./imgs/${ps.equippedIdolKey}/1.jpg`;
        } else {
          avatarMap[uid] = './imgs/assets/default_avatar.png';
        }
      } else {
        avatarMap[uid] = './imgs/assets/default_avatar.png';
      }
    }
  }
  imgs.forEach(img => {
    const uid = img.getAttribute('data-userid');
    if (avatarMap[uid]) {
      img.src = avatarMap[uid];
    }
  });
}

function renderBattleLogsOnly() {
  ensureBattlesDefaults();
  const logsHost = document.getElementById('battleLogList');
  if (!logsHost) return;
  logsHost.innerHTML = "";
  const logs = (GAME_STATE.battles.logs || []).slice().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  if (!logs.length) {
    logsHost.innerHTML = `<div class="glass-card rounded-2xl p-4 text-sm text-gray-600">No battle results yet.</div>`;
    return;
  }
  logs.forEach(l => {
    const unseen = !GAME_STATE.battles.seenLogIds[l.id];
    const row = document.createElement('div');
    row.className = `glass-card rounded-2xl p-4 ${unseen ? 'ring-2 ring-red-400' : ''}`;
    const isTie = l.tie === true;
    // ── INDIVIDUAL SCORE LINE PER PLAYER (game‑dependent) ──
    let meScoreHtml = '';
    let oppScoreHtml = '';
    if (l.game === 'showtime') {
      meScoreHtml = `${Number(l.youTimeSec ?? 0).toFixed(2)}s`;
      oppScoreHtml = `${Number(l.oppTimeSec ?? 0).toFixed(2)}s`;
    } else if (l.game === 'spotlight') {
      meScoreHtml = `${l.youHits ?? 0} hits`;
      oppScoreHtml = `${l.oppHits ?? 0} hits`;
    } else if (l.game === 'snakeventeen') {
      meScoreHtml = `Length: ${l.youLength ?? 0}`;
      oppScoreHtml = `Length: ${l.oppLength ?? 0}`;
    }
    if (isTie) {
      // ── TIE layout ─────────────────────────────────
      const me = (l.player1?.userId === currentUser?.id) ? l.player1 : l.player2;
      const opp = me === l.player1 ? l.player2 : l.player1;
      const meAvatar = me?.avatarSrc || './imgs/assets/default_avatar.png';
      const oppAvatar = opp?.avatarSrc || './imgs/assets/default_avatar.png';
      // PATCH G-03: escape display names in TIE log branch
      const meName = escapeHtml(me?.displayName || me?.username || 'You');
      const oppName = escapeHtml(opp?.displayName || opp?.username || 'Opponent');
      const meUsername = escapeHtml(me?.username || '');
      const oppUsername = escapeHtml(opp?.username || '');
      row.innerHTML = `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            ${battleGameIconHtml(l)}
            <span class="font-extrabold text-gray-900">${battleGameLabel(l)}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <!-- Left player -->
            <div class="flex flex-col items-center min-w-0" style="flex:1;">
              <img class="avatar-sm" src="${meAvatar}" alt="me"
                style="border-radius:16px; border: 2.5px solid #9ca3af; box-shadow: 0 0 0 2px rgba(156,163,175,0.25);"/>
              <span class="text-[10px] font-black text-gray-500">TIE</span>
              <div class="text-center mt-1">
                <div class="font-extrabold text-gray-900 text-sm" style="word-break:break-word; white-space:normal;">${meName}</div>
                <div class="text-xs text-gray-500 font-bold" style="word-break:break-word; white-space:normal;">@${meUsername}</div>
                <div class="text-[10px] font-bold text-gray-500 mt-1">${meScoreHtml}</div>
              </div>
            </div>
            <!-- VS -->
            <div class="text-sm font-black text-gray-400 flex-shrink-0">VS</div>
            <!-- Right player -->
            <div class="flex flex-col items-center min-w-0" style="flex:1;">
              <img class="avatar-sm" src="${oppAvatar}" alt="opponent"
                style="border-radius:16px; border: 2.5px solid #9ca3af; box-shadow: 0 0 0 2px rgba(156,163,175,0.25);"/>
              <span class="text-[10px] font-black text-gray-500">TIE</span>
              <div class="text-center mt-1">
                <div class="font-extrabold text-gray-900 text-sm" style="word-break:break-word; white-space:normal;">${oppName}</div>
                <div class="text-xs text-gray-500 font-bold" style="word-break:break-word; white-space:normal;">@${oppUsername}</div>
                <div class="text-[10px] font-bold text-gray-500 mt-1">${oppScoreHtml}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // ── Win / Loss layout ─────────────────────────
      const isYouWinner = l?.winner?.username === currentUser?.username;
      const me = isYouWinner ? l?.winner : l?.loser;
      const opp = isYouWinner ? l?.loser : l?.winner;
      const meAvatar = me?.avatarSrc || './imgs/assets/default_avatar.png';
      const oppAvatar = opp?.avatarSrc || './imgs/assets/default_avatar.png';
      // PATCH G-03 (win/loss branch): escape display names
      const meName = escapeHtml(me?.displayName || me?.username || 'You');
      const oppName = escapeHtml(opp?.displayName || opp?.username || 'Opponent');
      const meUsername = escapeHtml(me?.username || '');
      const oppUsername = escapeHtml(opp?.username || '');
      row.innerHTML = `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            ${battleGameIconHtml(l)}
            <span class="font-extrabold text-gray-900">${battleGameLabel(l)}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <!-- Left player -->
            <div class="flex flex-col items-center min-w-0" style="flex:1;">
              <img class="avatar-sm" src="${meAvatar}" alt="me" style="border-radius:16px; ${isYouWinner ? 'border: 2.5px solid #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.25);' : 'border: 2.5px solid #ef4444; box-shadow: 0 0 0 2px rgba(239,68,68,0.25);'}"/>
              <span class="text-[10px] font-black ${isYouWinner ? 'text-green-600' : 'text-red-500'}">${isYouWinner ? 'WIN' : 'LOSS'}</span>
              <div class="text-center mt-1">
                <div class="font-extrabold text-gray-900 text-sm" style="word-break:break-word; white-space:normal;">${meName}</div>
                <div class="text-xs text-gray-500 font-bold" style="word-break:break-word; white-space:normal;">@${meUsername}</div>
                <div class="text-[10px] font-bold text-gray-500 mt-1">${meScoreHtml}</div>
              </div>
            </div>
            <!-- VS -->
            <div class="text-sm font-black text-gray-400 flex-shrink-0">VS</div>
            <!-- Right player -->
            <div class="flex flex-col items-center min-w-0" style="flex:1;">
              <img class="avatar-sm" src="${oppAvatar}" alt="opponent" style="border-radius:16px; ${!isYouWinner ? 'border: 2.5px solid #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.25);' : 'border: 2.5px solid #ef4444; box-shadow: 0 0 0 2px rgba(239,68,68,0.25);'}"/>
              <span class="text-[10px] font-black ${!isYouWinner ? 'text-green-600' : 'text-red-500'}">${!isYouWinner ? 'WIN' : 'LOSS'}</span>
              <div class="text-center mt-1">
                <div class="font-extrabold text-gray-900 text-sm" style="word-break:break-word; white-space:normal;">${oppName}</div>
                <div class="text-xs text-gray-500 font-bold" style="word-break:break-word; white-space:normal;">@${oppUsername}</div>
                <div class="text-[10px] font-bold text-gray-500 mt-1">${oppScoreHtml}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    logsHost.appendChild(row);
  });
}

function openNews() {
  renderHub();
  renderNewsRequestsOnly();
  showScreen('newsScreen');
  markAllIncomingBattlesSeen();
  updatePanelBadges();
  updateHamburgerBadge();
}

async function renderNewsRequestsOnly() {
  ensureBattlesDefaults();
  await syncIncomingBattlesFromDb();
  const incomingHost = document.getElementById('newsIncomingBattles');
  if (incomingHost) incomingHost.innerHTML = "";
  const incoming = (GAME_STATE.battles.pendingIncoming || []).filter(b => b.status === "awaiting_accept");
  if (incomingHost) {
    if (incoming.length) {
      incoming.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(b => {
        const row = document.createElement('div');
        row.className = "glass-card rounded-2xl p-4";
        row.innerHTML = `
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 font-extrabold text-gray-900 truncate">
                ${battleGameIconHtml(b)} ${escapeHtml(battleGameLabel(b))} request
              </div>
              <div class="text-xs text-gray-500 font-bold mt-1">From ${escapeHtml(b.fromDisplayName || b.fromUsername)} (@${escapeHtml(b.fromUsername || '')})</div>
              <div class="text-xs text-gray-500 font-bold mt-1">
                ${
                  b.game === 'spotlight'
                    ? ``
                    : b.game === 'snakeventeen'
                      ? ``
                      : ``
                }
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button class="glass-card w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-100" onclick="acceptBattle('${escapeHtml(b.id)}')">
                <i class="fas fa-check text-green-600"></i>
              </button>
              <button class="glass-card w-10 h-10 rounded-2xl flex items-center justify-center bg-red-100" onclick="rejectBattle('${escapeHtml(b.id)}')">
                <i class="fas fa-xmark text-red-600"></i>
              </button>
            </div>
          </div>
        `;
        incomingHost.appendChild(row);
      });
    } else {
      incomingHost.innerHTML = `<div class="glass-card rounded-2xl p-4 text-sm text-gray-600">No battle requests.</div>`;
    }
  }
}

function winnerLoserLayoutHtml(l) {
  const isYouWinner = l?.winner?.username === currentUser?.username;
  const me = isYouWinner ? l?.winner : l?.loser;
  const opp = isYouWinner ? l?.loser : l?.winner;
  const meAvatar = escapeHtml(me?.avatarSrc || './imgs/assets/default_avatar.png');  // S-03 FIX
  const oppAvatar = escapeHtml(opp?.avatarSrc || './imgs/assets/default_avatar.png');  // S-03 FIX
  // PATCH G-02: escape display names before injecting into innerHTML
  const meName = escapeHtml(me?.displayName || me?.username || 'You');
  const oppName = escapeHtml(opp?.displayName || opp?.username || 'Opponent');
  const meUser = me?.username ? `@${escapeHtml(me.username)}` : '';
  const oppUser = opp?.username ? `@${escapeHtml(opp.username)}` : '';
  const meBorder = isYouWinner ? 'border: 2.5px solid #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.25);' : 'border: 2.5px solid #ef4444; box-shadow: 0 0 0 2px rgba(239,68,68,0.25);';
  const oppBorder = isYouWinner ? 'border: 2.5px solid #ef4444; box-shadow: 0 0 0 2px rgba(239,68,68,0.25);' : 'border: 2.5px solid #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.25);';
  const meLabel = isYouWinner ? '<span class="text-[10px] font-black text-green-600">WIN</span>' : '<span class="text-[10px] font-black text-red-500">LOSS</span>';
  const oppLabel = isYouWinner ? '<span class="text-[10px] font-black text-red-500">LOSS</span>' : '<span class="text-[10px] font-black text-green-600">WIN</span>';
  const gameIcon = battleGameIconHtml(l);
  return `
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <div class="flex flex-col items-center gap-1 flex-shrink-0">
          <img class="avatar-sm" src="${meAvatar}" data-userid="${me?.userId || ''}" alt="me" style="border-radius:16px; ${meBorder}"/>${gameIcon}
          ${meLabel}
        </div>
        <div class="min-w-0">
          <div class="font-extrabold text-gray-900 truncate">${meName}</div>
          <div class="text-xs text-gray-500 font-bold truncate">${meUser}</div>
        </div>
      </div>

      <div class="text-xs font-black text-gray-400 flex-shrink-0">VS ${battleGameLabel(l)}</div>

      <div class="flex items-center gap-2 min-w-0 justify-end text-right">
        <div class="min-w-0">
          <div class="font-extrabold text-gray-900 truncate">${oppName}</div>
          <div class="text-xs text-gray-500 font-bold truncate">${oppUser}</div>
        </div>
        <div class="flex flex-col items-center gap-1 flex-shrink-0">
          <img class="avatar-sm" src="${oppAvatar}" data-userid="${opp?.userId || ''}" alt="opponent" style="border-radius:16px; ${oppBorder}"/>${gameIcon}
          ${oppLabel}
        </div>
      </div>
    </div>
  `;
}

function openBattleFlow() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  ensureFriendsDefaults();
  if (!GAME_STATE.friends.list.length) {
    openModal("Performance Duel", `
      <div class="glass-card rounded-2xl p-4">
          <p class="text-sm text-gray-700 font-semibold">You have no friends yet.</p>
          <p class="text-xs text-gray-500 font-bold mt-2">Add friends to start duelling.</p>
      </div>
      <div class="grid grid-cols-1 gap-3 pt-2">
          <button class="btn-theme black-text" onclick="closeModal(); openFriends(); setTimeout(()=>openAddFriendsModal(), 250);">Add Friends</button>
      </div>
    `);
    return;
  }
  // new: minigame selection
  openBattleGameSelection();
}

function openBattleGameSelection() {
  const games = BATTLE_GAMES;
  const rows = Object.keys(games).map(key => {
    const g = games[key];
    return `
      <button onclick="selectBattleGame('${key}')" style="
        display:flex; align-items:center; gap:12px;
        width:100%; padding:14px 16px;
        border-radius:18px; background:rgba(255,255,255,0.85);
        border:1px solid rgba(255,255,255,0.7);
        box-shadow:0 8px 18px rgba(0,0,0,0.07);
        text-align:left; cursor:pointer;
        transition: transform 0.12s ease, filter 0.2s ease;
      ">
        <img src="${escapeHtml(g.icon)}" alt="${escapeHtml(g.name)}" style="width:42px;height:42px;object-fit:contain;" />
        <span class="font-extrabold text-gray-900">${escapeHtml(g.name)}</span>
        <i class="fas fa-chevron-right text-gray-400 ml-auto"></i>
      </button>
    `;
  }).join('');
  openModal("Choose Minigame", `
    <div class="space-y-2">${rows}</div>
  `);
}
let selectedBattleGame = null;

function selectBattleGame(gameKey) {
  selectedBattleGame = gameKey;
  openBattleFriendSelection(gameKey);
}

function openBattleFriendSelection(gameKey) {
  const game = BATTLE_GAMES[gameKey];
  if (!game) return;
  const levelKey = game.levelKey;
  const sortedFriends = [...GAME_STATE.friends.list].sort((a, b) => (b[levelKey] || 0) - (a[levelKey] || 0));
  const rows = sortedFriends.map(f => {
    const friendLevel = f[levelKey] ?? 0;
    return `
      <button class="select-row" onclick="selectBattleOpponent('${escapeHtml(f.userId)}', '${escapeHtml(gameKey)}', this)" id="friend_${escapeHtml(f.userId)}">
        <img src="${escapeHtml(f.avatarSrc || './imgs/assets/default_avatar.png')}" alt="${escapeHtml(f.displayName || f.username)}" style="width:32px;height:32px;border-radius:12px;object-fit:cover;" />
        <div class="flex-1 min-w-0">
            <div class="name" style="font-size:13px; font-weight:800; color:#0f172a;">${f.displayName || f.username}</div>
            <div class="sub" style="font-size:11px; color:#64748b; margin-top:2px;">@${f.username || ''} • Lv. ${friendLevel}</div>
        </div>
        <div class="selected-indicator" style="display:none; position:absolute; top:6px; right:8px; font-size:10px; font-weight:900; color:#1d4ed8; background:rgba(59,130,246,0.12); padding:2px 6px; border-radius:9999px;">Selected</div>
      </button>
    `;
  }).join("");
  const titleHtml = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap: 12px; width:100%;">
      <button style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 8px rgba(0,0,0,0.08);cursor:pointer;"
              onclick="closeModal(); openBattleGameSelection();">
        <i class="fas fa-arrow-left" style="color:#475569;font-size:12px;"></i>
      </button>
      <span style="font-weight:900;font-size:16px;color:#0f172a;flex:1;text-align:center;">Select ${game.name} Opponent</span>
      <div style="width:32px;"></div>
    </div>
  `;
  const bodyHtml = `
    <div class="select-main-list space-y-2">${rows}</div>
    <div id="battleConfirmBtnContainer" class="mt-4" style="display:none;">
      <button class="btn-theme black-text w-full py-3 rounded-2xl font-extrabold" onclick="confirmBattleStart('${escapeHtml(gameKey)}')">Confirm</button>
    </div>
  `;
  openModalWithHtmlTitle(titleHtml, bodyHtml);
  _selectedBattleOpponentId = null;  // S-01 FIX: use module-scoped var
}

function generateBattleDeckSpec() {
  const chosenIdols = pickIdolsForLevel(8);
  const slots = chosenIdols.map(idol => {
    const [img1, img2] = pickTwoDistinctImages(idol.key);
    return {
      idolKey: idol.key,
      img1,
      img2
    };
  });
  const indices = Array.from({
    length: 16
  }, (_, i) => i);
  shuffle(indices);
  return {
    slots,
    shuffleOrder: indices
  };
}

function buildDeckFromSpec(spec) {
  const rawDeck = [];
  spec.slots.forEach(slot => {
    const idol = IDOLS.find(i => i.key === slot.idolKey);
    if (!idol) return;
    const rarity = IDOL_RARITY[slot.idolKey] || 'rare';
    rawDeck.push(makeCardData(idol, rarity, slot.img1));
    rawDeck.push(makeCardData(idol, rarity, slot.img2));
  });
  const orderedDeck = new Array(16);
  spec.shuffleOrder.forEach((origIdx, newIdx) => {
    if (rawDeck[origIdx]) orderedDeck[newIdx] = rawDeck[origIdx];
  });
  return orderedDeck.filter(Boolean);
}

async function startBattleWithFriend(friendUserId, gameKey = 'showtime') {
  ensureBattlesDefaults();
  if (!(await userExistsById(friendUserId))) {
    showToast("This account no longer exists.", "error");
    await cleanupDeletedUsersFromFriendsAndBattles();
    renderFriends();
    return;
  }
  const friend = GAME_STATE.friends.list.find(f => f.userId === friendUserId);
  if (!friend) {
    showToast("Friend not found", "error");
    return;
  }
  const battleId = `bt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const sharedAbilityOffers = pickRandomOffers(4); // ← ADD THIS
  const sharedDeckSpec = generateBattleDeckSpec();
  const battle = {
    id: battleId,
    fromUserId: currentUser.id,
    fromUsername: currentUser.username,
    fromDisplayName: currentUser.displayName || currentUser.username,
    toUserId: friend.userId,
    toUsername: friend.username,
    toDisplayName: friend.displayName || friend.username,
    sharedAbilityOffers, // ← ADD THIS FIELD
    sharedDeckSpec,
    sharedSpotlightSpec: gameKey === 'spotlight' ? buildSpotlightBattleSpec() : null,
    sharedSnakeSpec: gameKey === 'snakeventeen' ? buildSnakeBattleSpec() : null,
    status: "awaiting_accept",
    game: gameKey,
    createdAt: Date.now(),
    fromTimeSec: null,
    toTimeSec: null
  };
  GAME_STATE.battles.pendingOutgoing.push(battle);
  await savePlayerState();
  if (db) {
    const ref = db.ref(`users/${friend.userId}/playerState/battles/pendingIncoming`);
    const snap = await ref.once('value');
    const arr = snap.val() || [];
    const list = Array.isArray(arr) ? arr : Object.values(arr);
    list.push(battle);
    await ref.set(list);
  }
  GAME_STATE.battles.active = {
    type: "friend",
    battleId,
    opponentUserId: friend.userId,
    opponentLabel: friend.displayName || friend.username,
    game: gameKey, // store which minigame
    sharedSpotlightSpec: gameKey === 'spotlight' ? (battle.sharedSpotlightSpec || null) : null,
    sharedSnakeSpec: gameKey === 'snakeventeen' ? (battle.sharedSnakeSpec || null) : null,
  };
  showToast("Battle created. Play your run!", "info");
  if (gameKey === 'spotlight') {
    startSpotlightBattle(battle);
  } else if (gameKey === 'snakeventeen') {
    startsnakeventeenBattle(battle);
  } else {
    startLevel();
  }
}

function isBattleRunActive() {
  return !!GAME_STATE.battles?.active;
}

async function onBattleRunFinished(timeSec) {
  ensureBattlesDefaults();
  const ctx = GAME_STATE.battles.active;
  if (!ctx) return;
  if (ctx.type === "friend") {
    const battleId = ctx.battleId;
    const b = GAME_STATE.battles.pendingOutgoing.find(x => x.id === battleId);
    if (b) {
      b.fromTimeSec = timeSec;
      b.status = "waiting_opponent";
    }
    if (db) {
      const ref = db.ref(`users/${ctx.opponentUserId}/playerState/battles/pendingIncoming`);
      const snap = await ref.once('value');
      const arr = snap.val() || [];
      const list = Array.isArray(arr) ? arr : Object.values(arr);
      list.forEach(x => {
        if (x.id === battleId) {
          x.fromTimeSec = timeSec;
          x.status = "awaiting_accept";
        }
      });
      await ref.set(list);
    }
    GAME_STATE.battles.active = null;
    await savePlayerState();
    showToast("Your time is saved. Check News after your opponent plays for results.", "info");
  }
}

async function syncIncomingBattlesFromDb() {
  if (!db || !currentUser?.id) return;
  ensureBattlesDefaults();
  const snap = await db.ref(`users/${currentUser.id}/playerState/battles/pendingIncoming`).once('value');
  const arr = snap.val() || [];
  const theList = Array.isArray(arr) ? arr : Object.values(arr);  // S-02 FIX
  GAME_STATE.battles.pendingIncoming = theList;
  await savePlayerState();
  updateNewsBadge();
}

async function acceptBattle(battleId) {
  ensureBattlesDefaults();
  const b = GAME_STATE.battles.pendingIncoming.find(x => x.id === battleId);
  if (!b) return;
  if (!(await userExistsById(b.fromUserId))) {
    GAME_STATE.battles.pendingIncoming = GAME_STATE.battles.pendingIncoming.filter(x => x.id !== battleId);
    await savePlayerState();
    showToast("Challenger no longer exists.", "error");
    renderNewsRequestsOnly();
    return;
  }
  b.status = "accepted";
  if (db) {
    const refIn = db.ref(`users/${currentUser.id}/playerState/battles/pendingIncoming`);
    const snapIn = await refIn.once('value');
    const arrIn = snapIn.val() || [];
    const listIn = Array.isArray(arrIn) ? arrIn : Object.values(arrIn);
    listIn.forEach(x => {
      if (x.id === battleId) x.status = "accepted";
    });
    await refIn.set(listIn);
  }
  const game = b.game || 'showtime';
  const active = {
    type: "friend_reply",
    battleId,
    opponentUserId: b.fromUserId,
    opponentLabel: b.fromDisplayName || b.fromUsername,
    sharedAbilityOffers: b.sharedAbilityOffers || [],
    game: game,
    // Showtime specific
    sharedDeckSpec: game === 'showtime' ? (b.sharedDeckSpec || null) : null,
    // Spotlight specific
    sharedSpotlightSpec: game === 'spotlight' ? (b.sharedSpotlightSpec || null) : null,
    // snakeventeen specific
    sharedSnakeSpec: game === 'snakeventeen' ? (b.sharedSnakeSpec || null) : null,
  };
  GAME_STATE.battles.active = active;
  await savePlayerState();
  showToast("Battle accepted. Play your run!", "info");
  if (game === 'spotlight') {
    startSpotlightBattle(b);
  } else if (game === 'snakeventeen') {
    startsnakeventeenBattle(b);
  } else {
    startLevel(); // default: Showtime
  }
  renderNewsRequestsOnly();
}

async function rejectBattle(battleId) {
  ensureBattlesDefaults();
  const idx = GAME_STATE.battles.pendingIncoming.findIndex(x => x.id === battleId);
  if (idx < 0) return;
  const b = GAME_STATE.battles.pendingIncoming[idx];
  GAME_STATE.battles.pendingIncoming.splice(idx, 1);
  if (db) {
    await db.ref(`users/${currentUser.id}/playerState/battles/pendingIncoming`).set(GAME_STATE.battles.pendingIncoming);
    const refOut = db.ref(`users/${b.fromUserId}/playerState/battles/pendingOutgoing`);
    const snapOut = await refOut.once('value');
    const arrOut = snapOut.val() || [];
    const listOut = Array.isArray(arrOut) ? arrOut : Object.values(arrOut);
    await refOut.set(listOut.filter(x => x.id !== battleId));
  }
  await savePlayerState();
  showToast("Battle rejected", "info");
  renderNewsRequestsOnly();
}

// ── SECURITY FIX [3]: Server-side battle integrity validation ─────────────
// Before trusting a locally-computed battle score we fetch the challenger's
// submitted score from the DB and verify the current player's score falls
// within plausible bounds.  Impossible values are clamped.
const _BATTLE_LIMITS = {
  showtime:    { minSec: 3,    maxSec: 600  },  // 3 s floor, 10 min ceiling
  spotlight:   { minHits: -20, maxHits: 120 },  // -20..120 hits per 20-second game
  snakeventeen:{ minLen: 3,    maxLen: 103  },  // snake starts at length 3; 10×10 grid = 100 cells
};

function _validateBattleScore(game, value) {
  const lim = _BATTLE_LIMITS[game];
  if (!lim) return value; // unknown game — pass through
  if (game === 'showtime') {
    if (value < lim.minSec) {
      console.warn(`[Security] Showtime time ${value}s below minimum — clamping to ${lim.minSec}s`);
      return lim.minSec;
    }
    if (value > lim.maxSec) return lim.maxSec;
    return value;
  }
  if (game === 'spotlight') {
    const clamped = Math.max(lim.minHits, Math.min(lim.maxHits, Math.round(value)));
    if (clamped !== value) console.warn(`[Security] Spotlight hits ${value} clamped to ${clamped}`);
    return clamped;
  }
  if (game === 'snakeventeen') {
    const clamped = Math.max(lim.minLen, Math.min(lim.maxLen, Math.round(value)));
    if (clamped !== value) console.warn(`[Security] Snake length ${value} clamped to ${clamped}`);
    return clamped;
  }
  return value;
}
// ── END SECURITY FIX [3] ──────────────────────────────────────────────────

async function finalizeFriendReplyBattleIfNeeded(timeSec) {
  ensureBattlesDefaults();
  const ctx = GAME_STATE.battles.active;
  if (!ctx || ctx.type !== "friend_reply") return;
  const b = GAME_STATE.battles.pendingIncoming.find(x => x.id === ctx.battleId);
  if (!b) {
    GAME_STATE.battles.active = null;
    return;
  }
  b.toTimeSec = timeSec;
  b.status = "completed";
  // SECURITY FIX [3]: validate score before comparing
  const youTime = _validateBattleScore('showtime', timeSec);
  const oppTime = Number(b.fromTimeSec ?? 9999);
  // Determine winner / tie
  let youWin = false;
  let tie = false;
  if (youTime < oppTime) {
    youWin = true;
  } else if (youTime > oppTime) {
    youWin = false;
  } else {
    tie = true;
  }
  // Update stats only if not a tie
  if (!tie) {
    if (youWin) {
      GAME_STATE.stats.battleWins = (GAME_STATE.stats.battleWins || 0) + 1;
    } else {
      GAME_STATE.stats.battleLosses = (GAME_STATE.stats.battleLosses || 0) + 1;
    }
  }
  // Build meta objects for log
  const youMeta = {
    userId: currentUser.id,
    username: currentUser.username,
    displayName: currentUser.displayName || currentUser.username,
    avatarSrc: equippedAvatarSrc()
  };
  const oppMeta = {
    userId: b.fromUserId,
    username: b.fromUsername,
    displayName: b.fromDisplayName || b.fromUsername,
    avatarSrc: './imgs/assets/default_avatar.png'
  };
  // Try to get opponent's real avatar
  if (db && b.fromUserId) {
    try {
      const snap = await db.ref(`users/${b.fromUserId}/playerState`).once('value').catch(() => null);
      const ps = snap?.val() || null;
      if (ps?.equippedIdolKey) oppMeta.avatarSrc = `./imgs/${ps.equippedIdolKey}/1.jpg`;
    } catch (e) {}
  }
  // Create log entry with tie support
  const logId = `log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const logEntry = {
    game: b.game || 'showtime',
    id: logId,
    completedAt: Date.now(),
    title: `Battle vs ${oppMeta.displayName}`,
    youTimeSec: youTime,
    oppTimeSec: oppTime,
    tie: tie,
    winnerLabel: tie ? "Tie" : (youWin ? "You" : oppMeta.displayName),
  };
  if (tie) {
    // Store both players explicitly so the renderer can identify them
    logEntry.player1 = youMeta;
    logEntry.player2 = oppMeta;
    logEntry.winner = null;
    logEntry.loser = null;
  } else {
    logEntry.winner = youWin ? youMeta : oppMeta;
    logEntry.loser = youWin ? oppMeta : youMeta;
  }
  GAME_STATE.battles.logs.push(logEntry);
  // Remove the incoming battle
  GAME_STATE.battles.pendingIncoming = GAME_STATE.battles.pendingIncoming.filter(x => x.id !== b.id);
  // ---------------------------------------------------------------
  // Update opponent's data on the server (with tie handling there too)
  if (db) {
    // Save my side
    await db.ref(`users/${currentUser.id}/playerState/battles/pendingIncoming`).set(GAME_STATE.battles.pendingIncoming);
    // Update opponent's side
    const refOpp = db.ref(`users/${b.fromUserId}/playerState`);
    const snapOpp = await refOpp.once('value');
    const oppPS = snapOpp.val() || {};
    oppPS.battles ||= {
      pendingIncoming: [],
      pendingOutgoing: [],
      active: null,
      logs: [],
      seenLogIds: {}
    };
    oppPS.battles.pendingIncoming ||= [];
    oppPS.battles.pendingOutgoing ||= [];
    oppPS.battles.logs ||= [];
    oppPS.battles.seenLogIds ||= {};
    const outEntry = oppPS.battles.pendingOutgoing.find(x => x.id === b.id);
    if (outEntry) {
      outEntry.toTimeSec = youTime;
      outEntry.status = "completed";
    }
    // Opponent's tie logic mirrored
    let oppWin = false;
    let oppTie = false;
    if (oppTime < youTime) {
      oppWin = true;
    } else if (oppTime > youTime) {
      oppWin = false;
    } else {
      oppTie = true;
    }
    const oppMeta2 = {
      userId: b.fromUserId,
      username: b.fromUsername,
      displayName: b.fromDisplayName || b.fromUsername,
      avatarSrc: oppMeta.avatarSrc
    };
    const youMetaForOpp = {
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName || currentUser.username,
      avatarSrc: equippedAvatarSrc()
    };
    const oppLogId = `log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const oppLogEntry = {
      game: b.game || 'showtime',
      id: oppLogId,
      completedAt: Date.now(),
      title: `Battle vs ${youMetaForOpp.displayName}`,
      youTimeSec: oppTime,
      oppTimeSec: youTime,
      tie: oppTie,
      winnerLabel: oppTie ? "Tie" : (oppWin ? oppMeta2.displayName : youMetaForOpp.displayName),
    };
    if (oppTie) {
      oppLogEntry.player1 = oppMeta2;
      oppLogEntry.player2 = youMetaForOpp;
      oppLogEntry.winner = null;
      oppLogEntry.loser = null;
    } else {
      oppLogEntry.winner = oppWin ? oppMeta2 : youMetaForOpp;
      oppLogEntry.loser = oppWin ? youMetaForOpp : oppMeta2;
    }
    oppPS.battles.logs.push(oppLogEntry);
    oppPS.battles.pendingOutgoing = oppPS.battles.pendingOutgoing.filter(x => x.id !== b.id);
    // SECURITY FIX [4]: Only update battle-related sub-paths on the
    // opponent's record — never overwrite their full playerState.
    const _oppUpdates = {};
    _oppUpdates[`users/${b.fromUserId}/playerState/battles/logs`]          = oppPS.battles.logs;
    _oppUpdates[`users/${b.fromUserId}/playerState/battles/pendingOutgoing`] = oppPS.battles.pendingOutgoing;
    if (!tie) {
      if (!oppWin) {
        _oppUpdates[`users/${b.fromUserId}/playerState/stats/battleLosses`] =
          (oppPS.stats?.battleLosses || 0) + 1;
      } else {
        _oppUpdates[`users/${b.fromUserId}/playerState/stats/battleWins`] =
          (oppPS.stats?.battleWins || 0) + 1;
      }
    }
    await db.ref().update(_oppUpdates);
  }
  GAME_STATE.battles.active = null;
  await savePlayerState();
  // Toast with tie message
  let message = 'Battle complete! ';
  if (tie) {
    message += 'Tie!';
  } else {
    message += youWin ? 'You win!' : 'You lose!';
  }
  message += ' Check news for details.';
  showToast(message, "success");
  updateNewsBadge();
}
