// ── SECURITY FIX [1]: Tamper detection for GAME_STATE ────────────────────
// We snapshot coins & level after every legitimate save.  Before the next
// save we check for unexpected jumps.  A cheater who types
//   GAME_STATE.coins = 9999999
// at the console will trigger this guard and their save will be discarded.
let _lastSavedCoins = 0;
let _lastSavedLevel = 0;
const _MAX_COIN_JUMP  = 300_000;  // PATCH S-07: raised to cover offlinelove cap (250 000)
const _MAX_LEVEL_JUMP = 1;        // levels advance one at a time

function _snapshotState() {
  _lastSavedCoins = GAME_STATE.coins;
  _lastSavedLevel = GAME_STATE.level;
}

window.__svtOnServerClamp = function (v) {
  if (!v) return;
  if (typeof v.coins === 'number') GAME_STATE.coins = v.coins;
  if (typeof v.level === 'number') GAME_STATE.level = v.level;
  if (typeof v.spotlightLevel === 'number') GAME_STATE.spotlightLevel = v.spotlightLevel;
  if (typeof v.snakeventeenLevel === 'number') GAME_STATE.snakeventeenLevel = v.snakeventeenLevel;
  if (typeof v.rings === 'number') GAME_STATE.rings = v.rings;
  if (typeof v.gems === 'number') GAME_STATE.gems = v.gems;
  if (typeof v.diamonds === 'number') GAME_STATE.diamonds = v.diamonds;
  if (typeof v.totalCoinsEarned === 'number' && GAME_STATE.stats) GAME_STATE.stats.totalCoinsEarned = v.totalCoinsEarned;
  _snapshotState();
  try { savePlayerStateLocal(); } catch (e) {}
  try { renderHub(); } catch (e) {}
  try { showToast('Some progress did not pass the server check and was corrected.', 'error'); } catch (e) {}
};

function _detectTampering() {
  const coinDelta  = GAME_STATE.coins - _lastSavedCoins;
  const levelDelta = GAME_STATE.level - _lastSavedLevel;

  if (coinDelta > _MAX_COIN_JUMP) {
    console.error(`[Security] Suspicious coin jump detected: +${coinDelta}. Save blocked.`);
    GAME_STATE.coins = _lastSavedCoins; // revert
    showToast('Data integrity check failed — please refresh.', 'error');
    return true; // tampered
  }
  if (levelDelta > _MAX_LEVEL_JUMP) {
    console.error(`[Security] Suspicious level jump detected: +${levelDelta}. Save blocked.`);
    GAME_STATE.level = _lastSavedLevel; // revert
    showToast('Data integrity check failed — please refresh.', 'error');
    return true; // tampered
  }
  return false; // clean
}
// ── END SECURITY FIX [1] ──────────────────────────────────────────────────

function getUserStateRef() {
  if (!db || !currentUser?.id) return null;
  return db.ref(`users/${currentUser.id}/playerState`);
}

function safeStructuredClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildPlayerStatePayload() {
  return safeStructuredClone({
    level: GAME_STATE.level,
    coins: GAME_STATE.coins,
    gems: GAME_STATE.gems || 0,
    diamonds: GAME_STATE.diamonds || 0,
    ownedIdolFrames: GAME_STATE.ownedIdolFrames || {},
    equippedIdolFrames: GAME_STATE.equippedIdolFrames || {},
    stats: GAME_STATE.stats,
    quests: GAME_STATE.quests,
    pendingNextLevel: !!GAME_STATE.pendingNextLevel,
    ownedIdols: GAME_STATE.ownedIdols || {},
    ownedAvatars: GAME_STATE.ownedAvatars || {},
    equippedIdolKey: GAME_STATE.equippedIdolKey || null,
    equippedAvatarKey: GAME_STATE.equippedAvatarKey || null,
    ownedProfileBackgrounds: GAME_STATE.ownedProfileBackgrounds || {},
    equippedProfileBackgroundKey: GAME_STATE.equippedProfileBackgroundKey || null,
    ownedProfileTitles: GAME_STATE.ownedProfileTitles || {},
    equippedProfileTitleKey: GAME_STATE.equippedProfileTitleKey || null,
    streak: GAME_STATE.streak || 0,
    daily: {
      dayKey: GAME_STATE.daily?.dayKey || hkDayKey(),
      hasDrawn: !!GAME_STATE.daily?.hasDrawn,
      wins: GAME_STATE.daily?.wins || 0,
      claimedCellIndex: GAME_STATE.daily?.claimedCellIndex ?? null,
      claimedCells: Array.isArray(GAME_STATE.daily?.claimedCells) ? GAME_STATE.daily.claimedCells.slice(0, 6) : [false, false, false, false, false, false], // L99
      // PATCH G-01: persist actual box state instead of always resetting it
      box: {
        claimed: !!GAME_STATE.daily?.box?.claimed,
        opened: !!GAME_STATE.daily?.box?.opened,
        star: GAME_STATE.daily?.box?.star ?? 1
      }
    },
    gifts: GAME_STATE.gifts || {
      scoupsForAth: {
        shown: false,
        claimed: false
      }
    },
    idolPower: GAME_STATE.idolPower || {},
    // P-02 FIX: incoming / outgoing are managed under friendRequests/ node.
    // Only save friends.list (accepted friends) in playerState.
    friends: {
      list: (GAME_STATE.friends && Array.isArray(GAME_STATE.friends.list))
        ? GAME_STATE.friends.list
        : [],
    },
    battles: {
      ...(GAME_STATE.battles || {}),
      active: null,
      pendingIncoming: GAME_STATE.battles?.pendingIncoming || [],
      pendingOutgoing: GAME_STATE.battles?.pendingOutgoing || [],
      logs: GAME_STATE.battles?.logs || [],
      seenLogIds: GAME_STATE.battles?.seenLogIds || {}
    },
    news: GAME_STATE.news || {
      seenIncomingBattleIds: {}
    },
    rings: GAME_STATE.rings || 0,
    snakeventeenLevel: GAME_STATE.snakeventeenLevel || 0,
    snakeventeenStreak: GAME_STATE.snakeventeenStreak || 0,
    stats: {
      ...(GAME_STATE.stats || {}),
      snakeventeenBestStreak: GAME_STATE.stats?.snakeventeenBestStreak || 0,
      snakeventeenLongestLength: GAME_STATE.stats?.snakeventeenLongestLength || 0
    },
    spotlightLevel: GAME_STATE.spotlightLevel ?? 0,
    spotlightStreak: GAME_STATE.spotlightStreak || 0,
    marriedIdols: GAME_STATE.marriedIdols || {},
    love: GAME_STATE.love || {},
    giftsInventory: GAME_STATE.giftsInventory || {},
    meta: GAME_STATE.meta || {},
    updatedAt: Date.now(),
    username: currentUser?.username || '',
    displayName: currentUser?.displayName || ''
  });
}

async function savePlayerStateToDb() {
  if (isSaveBlocked()) return false;
  const ref = getUserStateRef();
  if (!ref) return false;
  try {
    await ref.set(buildPlayerStatePayload());
    return true;
  } catch (e) {
    console.warn('DB save failed, will keep local fallback:', e);
    return false;
  }
}

async function loadPlayerStateFromDb() {
  const ref = getUserStateRef();
  try {
    const snap = await ref.once('value');
    return snap.val() || null;
  } catch (e) {
    console.warn('DB load failed, using local fallback:', e);
    return null;
  }
}

function savePlayerStateLocal() {
  if (!currentUser) return;
  if (isSaveBlocked()) return;
  localStorage.setItem(`playerState:${currentUser.username}`, JSON.stringify(buildPlayerStatePayload()));
}

function loadPlayerStateLocal() {
  if (!currentUser) return null;
  const raw = localStorage.getItem(`playerState:${currentUser.username}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function savePlayerState() {
  if (isSaveBlocked()) return;
  // SECURITY FIX [1]: abort & revert if tampering is detected
  if (_detectTampering()) return;
  savePlayerStateLocal();
  await savePlayerStateToDb();
  _snapshotState(); // record the clean baseline for the next check
}

function applyLoadedPlayerState(payload) {
  if (!payload) return;
  GAME_STATE.level = payload.level ?? 0;
  GAME_STATE.coins = payload.coins ?? 0;
  GAME_STATE.gems = Math.max(0, Number(payload.gems) || 0);
  GAME_STATE.diamonds = Math.max(0, Number(payload.diamonds) || 0);
  GAME_STATE.ownedIdolFrames = (payload.ownedIdolFrames && typeof payload.ownedIdolFrames === 'object') ? payload.ownedIdolFrames : {};
  GAME_STATE.equippedIdolFrames = (payload.equippedIdolFrames && typeof payload.equippedIdolFrames === 'object') ? payload.equippedIdolFrames : {};
  GAME_STATE.pendingNextLevel = !!payload.pendingNextLevel;
  GAME_STATE.equippedAvatarKey = payload.equippedAvatarKey || null;
  GAME_STATE.ownedAvatars = payload.ownedAvatars || {};
  GAME_STATE.ownedProfileBackgrounds = payload.ownedProfileBackgrounds || {};
  GAME_STATE.equippedProfileBackgroundKey = payload.equippedProfileBackgroundKey || null;
  GAME_STATE.ownedProfileTitles = payload.ownedProfileTitles || {};
  GAME_STATE.equippedProfileTitleKey = payload.equippedProfileTitleKey || null;
  const defaultStats = GAME_STATE.stats;
  GAME_STATE.stats = {
    totalCoinsEarned: 0,
    ...defaultStats,
    ...(payload.stats || {}),
    idolMatches: {
      ...(defaultStats.idolMatches || {}),
      ...((payload.stats && payload.stats.idolMatches) || {})
    },
  };
  if (GAME_STATE.stats.bestStreak == null) GAME_STATE.stats.bestStreak = 0;
  GAME_STATE.quests = Array.isArray(payload.quests) ? payload.quests : [];
  GAME_STATE.ownedIdols = (payload.ownedIdols && typeof payload.ownedIdols === 'object') ? payload.ownedIdols : {};
  GAME_STATE.equippedIdolKey = payload.equippedIdolKey ?? null;
  GAME_STATE.pendingMainIdolKey = null;
  GAME_STATE.streak = payload.streak ?? 0;
  const today = hkDayKey();
  const defaultDaily = {
    dayKey: today,
    hasDrawn: false,
    wins: 0,
    claimedCellIndex: null,
    box: {
      claimed: false,
      opened: false,
      star: 1
    },
    claimedCells: [false, false, false, false, false, false] // L99
  };
  GAME_STATE.daily = (payload.daily && typeof payload.daily === 'object') ? {
    ...defaultDaily,
    ...payload.daily,
    box: (payload.daily.box && typeof payload.daily.box === 'object') ? {
      claimed: payload.daily.box.claimed ?? false,
      opened:  payload.daily.box.opened  ?? false,
      star:    payload.daily.box.star    ?? 1
    } : { claimed: false, opened: false, star: 1 }
  } : defaultDaily;
  GAME_STATE.daily.claimedCells = Array.isArray(GAME_STATE.daily.claimedCells) ? GAME_STATE.daily.claimedCells.slice(0, 6) : [false, false, false, false, false, false]; // L99
  while (GAME_STATE.daily.claimedCells.length < 6) GAME_STATE.daily.claimedCells.push(false); // L99
  GAME_STATE.daily.claimedCellIndex = (typeof GAME_STATE.daily.claimedCellIndex === 'number') ? GAME_STATE.daily.claimedCellIndex : null;
  const defaultGifts = {
    scoupsForAth: {
      shown: false,
      claimed: false
    }
  };
  GAME_STATE.gifts = (payload.gifts && typeof payload.gifts === 'object') ? {
    ...defaultGifts,
    ...payload.gifts,
    scoupsForAth: {
      ...defaultGifts.scoupsForAth,
      ...(payload.gifts.scoupsForAth || {})
    }
  } : defaultGifts;
  GAME_STATE.idolPower = (payload.idolPower && typeof payload.idolPower === 'object') ? payload.idolPower : {};
  GAME_STATE.friends = (payload.friends && typeof payload.friends === 'object') ? payload.friends : {
    list: [],
    incoming: [],
    outgoing: []
  };
  GAME_STATE.battles = (payload.battles && typeof payload.battles === 'object') ? payload.battles : {
    pendingIncoming: [],
    pendingOutgoing: [],
    active: null,
    logs: [],
    seenLogIds: {}
  };
  GAME_STATE.battles.active = null;
  GAME_STATE.news = (payload.news && typeof payload.news === 'object') ? payload.news : {
    seenIncomingBattleIds: {}
  };
  GAME_STATE.rings = payload.rings ?? 0;
  GAME_STATE.snakeventeenLevel = payload.snakeventeenLevel || 0;
  GAME_STATE.snakeventeenStreak = payload.snakeventeenStreak || 0;
  GAME_STATE.stats.snakeventeenBestStreak = payload.stats?.snakeventeenBestStreak || 0;
  GAME_STATE.stats.snakeventeenLongestLength = payload.stats?.snakeventeenLongestLength || 0;
  GAME_STATE.spotlightLevel = payload.spotlightLevel ?? 0;
  GAME_STATE.spotlightStreak = payload.spotlightStreak ?? 0;
  GAME_STATE.marriedIdols = payload.marriedIdols || {};
  GAME_STATE.love = payload.love || {};
  GAME_STATE.giftsInventory = payload.giftsInventory || {};
  GAME_STATE.meta = (payload.meta && typeof payload.meta === 'object') ? payload.meta : {};
  if (typeof Meta !== 'undefined') { try { Meta.ensure(); } catch (e) { console.warn('[Meta]', e); } }
  // SECURITY FIX [1]: baseline snapshot after load
  if (typeof _snapshotState === 'function') _snapshotState();
}

let __prefetchedPlayerState = null; // set at sign-in from the user node we already fetched
async function loadPlayerState() {
  const prefetched = __prefetchedPlayerState;
  __prefetchedPlayerState = null;
  const fromDb = prefetched || await loadPlayerStateFromDb();
  if (fromDb) {
    applyLoadedPlayerState(fromDb);
    savePlayerStateLocal();
    return;
  }
  const fromLocal = loadPlayerStateLocal();
  if (fromLocal) applyLoadedPlayerState(fromLocal);
}

function defaultAvatarSvgDataUri() {
  return './imgs/assets/default_avatar.png';
}

function getThemeIdolKey() {
  if (GAME_STATE.equippedIdolKey && isIdolOwned(GAME_STATE.equippedIdolKey)) {
    return GAME_STATE.equippedIdolKey;
  }
  return null;
}

function equippedAvatarSrc() {
  // If user has a purchased avatar, use it
  if (GAME_STATE.equippedAvatarKey) {
    return `./imgs/assets/avatars/${GAME_STATE.equippedAvatarKey}`;
  }
  // Fall back to idol image only if no avatar purchased
  const k = getThemeIdolKey();
  if (!k) return './imgs/assets/default_avatar.png';
  return `./imgs/${k}/1.jpg`;
}

function applyThemeForEquippedIdol() {
  const k = getThemeIdolKey();
  const pair = (k && IDOL_THEME[k]) ? IDOL_THEME[k] : ["#f5c6d0", "#9ec5d9"];
  const [c1, c2] = pair;
  document.documentElement.style.setProperty("--theme1", c1);
  document.documentElement.style.setProperty("--theme2", c2);
  document.documentElement.style.setProperty("--bg1", "#f8d7e0");
  document.documentElement.style.setProperty("--bg2", "#a8d4e6");
  document.documentElement.style.setProperty("--app1", "#ffffff");
  document.documentElement.style.setProperty("--app2", "#f8fafc");
}

function applyFlipSpeedCss() {
  const mult = GAME_STATE.runtime.flipSpeedMult || 1;
  const baseDuration = 420;
  const duration = baseDuration / mult;
  const backDelay = duration + 50; // keep the extra 50ms for the back reveal delay
  document.documentElement.style.setProperty('--flip-duration', `${duration}ms`);
  document.documentElement.style.setProperty('--flip-back-delay', `${backDelay}ms`);
}

function renderAvatars() {
  const hubA = document.getElementById('hubAvatar');
  const setA = document.getElementById('settingsAvatar');
  const src = equippedAvatarSrc();
  if (hubA) hubA.src = src;
  if (setA) setA.src = src;
  applyThemeForEquippedIdol();
}

function isIdolOwned(idolKey) {
  return !!(GAME_STATE.ownedIdols && GAME_STATE.ownedIdols[idolKey]);
}

function idolMatchCount(idolKey) {
  return Number(GAME_STATE.stats?.idolMatches?.[idolKey] || 0);
}

function getIdolPower(idolKey) {
  if (GAME_STATE.levelAbilities?.battleMode) return 17;
  // Non-owned idols are always power 1
  if (!isIdolOwned(idolKey)) return 1;
  const v = Number(GAME_STATE.idolPower?.[idolKey] ?? 1);
  return Math.max(1, Math.min(17, v || 1));
}

function setIdolPower(idolKey, lvl) {
  GAME_STATE.idolPower ||= {};
  GAME_STATE.idolPower[idolKey] = Math.max(1, Math.min(17, Number(lvl) || 1));
}

function nextPowerUpgradeCost(currentLevel) {
  if (currentLevel >= 17) return null;
  return POWER_UPGRADE_COSTS[currentLevel - 1] ?? null;
}

async function equipIdol(idolKey) {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  // Only married idols can be used as theme
  const isMarried = Boolean(GAME_STATE?.marriedIdols && GAME_STATE.marriedIdols[idolKey]);
  if (!isMarried) {
    showToast('Only married idols can be selected as theme.', 'error');
    return;
  }
  GAME_STATE.equippedIdolKey = idolKey;
  // instantly re-theme visible UI
  renderAvatars();
  renderHub();
  renderIdols();
  if (!document.getElementById('questsScreen').classList.contains('hidden')) {
    renderQuests();
  }
  await savePlayerState();
  const idol = IDOLS.find(i => i.key === idolKey);
  showToast(`Theme set to ${idol?.display || idolKey}`, 'success');
}
