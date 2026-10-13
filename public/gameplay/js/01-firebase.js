const firebaseConfig = {
  apiKey: "AIzaSyBfpCJrqAul3meDQ764dUetTxQvf0_iOK8",
  authDomain: "svt-match.firebaseapp.com",
  databaseURL: "https://svt-match-default-rtdb.firebaseio.com",
  projectId: "svt-match",
  storageBucket: "svt-match.firebasestorage.app",
  messagingSenderId: "16709407764",
  appId: "1:16709407764:android:85fc7f8e04478fbe0c4301"
};
let db;
let auth;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  auth = firebase.auth();           // ← ADD THIS
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); // stays logged in
} catch (e) {
  console.log('Firebase not configured - using local storage fallback');
}
let currentUser = null;
let __secondsOnlineInterval = null;
let __friendsPreloadPromise = null;
let CAME_FROM_PANEL = false;

async function preloadFriendsData() {
  await reloadMyFriendsFromDbOrLocal();
  await refreshAllFriendsMeta(true); // all metainfo now stored in GAME_STATE.friends.list
}

function openSlidePanel() {
  const overlay = document.getElementById('slidePanelOverlay');
  overlay.style.display = 'block';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
  });
  updatePanelBadges();
}

function closeSlidePanel() {
  const overlay = document.getElementById('slidePanelOverlay');
  overlay.classList.remove('show');
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 380);
}

function closeSlidePanelOnBackdrop(e) {
  if (e.target === document.getElementById('slidePanelOverlay')) {
    closeSlidePanel();
  }
}

function openNewsFromPanel() {
  CAME_FROM_PANEL = true;
  closeSlidePanel();
  setTimeout(() => openNews(), 200);
}

function openBattleLogsFromPanel() {
  CAME_FROM_PANEL = true;
  closeSlidePanel();
  setTimeout(() => openBattleLogs(), 200);
}

function openSettingsFromPanel() {
  CAME_FROM_PANEL = true;
  closeSlidePanel();
  setTimeout(() => openSettings(), 200);
}
// NEW

function goBackFromPanelScreen() {
  showScreen('hubScreen');
  renderHub();
  const overlay = document.getElementById('slidePanelOverlay');
  const panel = document.getElementById('slidePanel');
  // Speed up: temporarily override transition to 0.2s
  panel.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
  overlay.style.transition = 'background 0.2s ease, backdrop-filter 0.2s ease';
  overlay.style.display = 'block';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
  });
  // Restore normal transition after animation finishes
  setTimeout(() => {
    panel.style.transition = '';
    overlay.style.transition = '';
  }, 250);
  updatePanelBadges();
  updateHamburgerBadge();
}
// Robust HKT day key helper
