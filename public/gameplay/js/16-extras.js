function opensnakeventeenStreakInfoModal() {
  openModal('ℹ️ Snakeventeen Streak', `
    <div class="glass-card rounded-2xl p-4">
      <p class="text-sm text-gray-700 font-semibold">
        Reach a length of 9 (eat 6 idols) to keep your streak alive.
        Each level your streak stays, you’ll earn an extra 10 coins per streak point.
      </p>
    </div>
  `);
}
// Override renderHub to update snakeventeen streak display
const _origRenderHub = renderHub;
renderHub = function() {
  _origRenderHub();
  const el = document.getElementById('snakeventeenStreakCount');
  if (el) el.textContent = GAME_STATE.snakeventeenStreak || 0;
};
// ── end snakeventeen ─────────────────────────────────────────
// ── IDOL UNLOCK ANIMATION ───────────────────────────────────────────────
const IDOL_DESCRIPTIONS = {
  scoups: "The General. Leader of SEVENTEEN with iron will and a warm heart.",
  jeonghan: "The Trickster. Known for his angelic face and devious smile.",
  joshua: "Holy Boy. Gentle guitar chords and effortless California charm.",
  jun: "The Martial Ace. Wuxia grace meets pop-star elegance.",
  hoshi: "Tiger of Performance. His choreography will leave you breathless.",
  wonwoo: "The Lone Wolf. Deep voice, deep thoughts, deeper gaze.",
  woozi: "The Producer. Small in stature, boundless in musical genius.",
  dk: "Dokyeom. Sunshine in human form — his smile lights up stadiums.",
  mingyu: "Visual King. Tall, charming, and somehow even cuter up close.",
  the8: "The Maverick. B-boy roots, fashion-forward future.",
  seungkwan: "BOOYAH! Vocal powerhouse and variety show legend.",
  vernon: "The Coolest. Born in NYC, his rap style is effortlessly ice-cold.",
  dino: "Baby Dino. The maknae who dances like he was born for the stage.",
};
const RARITY_BG_GRADIENT = {
  kkuma: 'linear-gradient(135deg,#facc15,#ef4444,#a855f7,#3b82f6)',
  legendary: 'linear-gradient(135deg,#fde68a 0%,#facc15 50%,#a16207 100%)',
  mythic: 'linear-gradient(135deg,#fecaca 0%,#ef4444 50%,#991b1b 100%)',
  epic: 'linear-gradient(135deg,#e9d5ff 0%,#a855f7 50%,#581c87 100%)',
  superrare: 'linear-gradient(135deg,#bfdbfe 0%,#3b82f6 50%,#1e3a8a 100%)',
  rare: 'linear-gradient(135deg,#bbf7d0 0%,#22c55e 50%,#14532d 100%)',
};

function showIdolUnlockAnimation(idolKey, onDone) {
  const idol = IDOLS.find(i => i.key === idolKey);
  const rarity = IDOL_RARITY[idolKey] || 'rare';
  const desc = IDOL_DESCRIPTIONS[idolKey] || '';
  const imgSrc = `./imgs/${idolKey}/1.jpg`;
  const rarityColor = rarityDotColor(rarity);
  const bgGrad = RARITY_BG_GRADIENT[rarity] || RARITY_BG_GRADIENT.rare;
  const ability = getAbilityForIdol(idolKey);
  const abilityName = ability?.label || '—';
  const overlay = document.getElementById('idolUnlockOverlay');
  const rarityBg = document.getElementById('idolUnlockRarityBg');
  const card = document.getElementById('idolUnlockCard');
  const img = document.getElementById('idolUnlockImg');
  const info = document.getElementById('idolUnlockInfo');
  const nameEl = document.getElementById('idolUnlockName');
  const rarityDotEl = document.getElementById('idolUnlockRarityDot');
  const rarityTxt = document.getElementById('idolUnlockRarityText');
  const descEl = document.getElementById('idolUnlockDesc');
  const rarityLbl = document.getElementById('idolUnlockRarityLabel');
  const particles = document.getElementById('idolUnlockParticles');
  const tapHint = document.getElementById('idolUnlockTap');
  const cardWrapper = card.parentElement;
  // ── Reset ────────────────────────────────────────────────────────────
  card.classList.remove('revealed');
  img.classList.remove('unblurred');
  info.style.display = 'none';
  rarityLbl.classList.remove('visible');
  overlay.style.background = 'rgba(10,10,20,0)';
  overlay.style.transition = 'background 0.25s ease';
  rarityBg.style.opacity = '0';
  rarityBg.style.background = bgGrad;
  rarityLbl.textContent = rarityDisplayName(rarity);
  particles.innerHTML = '';
  cardWrapper.style.transform = '';  // G-14 FIX: '' not translateX(-50%)
  cardWrapper.style.transition = '';
  // ▼▼▼ CHANGES for smaller image & no tap hint ▼▼▼
  card.style.width = '180px'; // make image smaller
  if (tapHint) tapHint.style.display = 'none'; // hide "Tap to reveal"
  img.src = imgSrc;
  nameEl.textContent = idol?.display || idolKey;
  descEl.textContent = desc;
  rarityDotEl.style.background = rarityColor;
  rarityTxt.textContent = rarityDisplayName(rarity);
  // Remove stale side‑panel from any previous call
  overlay.querySelector('.unlock-side-info')?.remove();
  // ── Build right‑side info panel (without "Tap to dismiss") ─────────
  const sideInfo = document.createElement('div');
  sideInfo.className = 'unlock-side-info';
  Object.assign(sideInfo.style, {
    position: 'absolute',
    right: '0',
    top: '0',
    bottom: '0',
    width: '45%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '20px 18px 20px 8px',
    opacity: '0',
    transition: 'opacity 0.45s ease 0.15s',
    pointerEvents: 'none',
    zIndex: '5',
  });
  sideInfo.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;
                border-radius:9999px;font-size:11px;font-weight:900;
                background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.3);
                color:white;margin-bottom:12px;width:fit-content;">
      <span style="width:9px;height:9px;border-radius:50%;background:${rarityColor};flex:0 0 auto;"></span>
      ${rarityDisplayName(rarity)}
    </div>
    <div style="font-size:20px;font-weight:900;color:white;margin-bottom:8px;
                text-shadow:0 2px 10px rgba(0,0,0,0.5);line-height:1.2;">
      ${idol?.display || idolKey}
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.88);font-weight:700;
                line-height:1.5;margin-bottom:14px;">${desc}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.65);font-weight:800;
                padding:6px 10px;background:rgba(255,255,255,0.12);
                border-radius:10px;border:1px solid rgba(255,255,255,0.2);">
      ✨ ${abilityName}
    </div>
  `; // ← "Tap to dismiss" removed
  overlay.appendChild(sideInfo);
  // ── Card starts hidden, centred ───────────────────────────────────────
  card.style.transition = 'none';
  card.style.transform = 'scale(0.05) rotateY(-180deg)';
  card.style.opacity = '0';
  overlay.classList.add('show');
  // 1 — Darken background immediately
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.background = 'rgba(5,5,15,0.90)';
  }));
  // 2 — Spin card in blurred
  setTimeout(() => {
    card.style.transition = 'transform 0.9s cubic-bezier(0.2,0.8,0.15,1), opacity 0.5s ease';
    card.style.transform = 'scale(1) rotateY(0deg)';
    card.style.opacity = '1';
  }, 150);
  // 3 — Colour wash
  setTimeout(() => {
    rarityBg.style.opacity = '0.55';
    rarityLbl.classList.add('visible');
  }, 900);
  let phase = 'blurred'; // blurred → revealed → done
  const onTap = () => {
    if (phase === 'blurred') {
      phase = 'revealed';
      // Unblur the idol image
      img.classList.add('unblurred');
      // Spawn particles from card centre
      for (let i = 0; i < 26; i++) {
        const p = document.createElement('div');
        p.className = 'unlock-particle';
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 160;
        p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
        p.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
        p.style.background = rarityColor;
        p.style.left = '50%';
        p.style.top = '40%';
        p.style.animationDelay = (Math.random() * 0.35) + 's';
        particles.appendChild(p);
      }
      // ▼▼▼ Slide distance reduced ▼▼▼
      cardWrapper.style.transition = 'transform 0.5s cubic-bezier(0.25,0.8,0.25,1)';
      cardWrapper.style.transform = 'translateX(-18%)';
      // Fade in side info
      sideInfo.style.opacity = '1';
      sideInfo.style.pointerEvents = 'auto';
      return;
    }
    // ── Dismiss ────────────────────────────────────────────────────────
    overlay.removeEventListener('click', onTap);
    overlay.style.background = 'rgba(5,5,15,0)';
    rarityBg.style.opacity = '0';
    sideInfo.style.opacity = '0';
    card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
    card.style.transform = 'scale(0.85)';
    card.style.opacity = '0';
    cardWrapper.style.transform = '';
    setTimeout(() => {
      overlay.classList.remove('show');
      card.style.transform = '';
      card.style.opacity = '';
      sideInfo.remove();
      if (onDone) onDone();
    }, 380);
  };
  // Allow tap after card has landed
  setTimeout(() => overlay.addEventListener('click', onTap), 1100);
}
// Coins and levels are awarded by the server only (api/_lib/awards.js).
// The client reports what happened and applies the numbers the server returns.
// Calling this never changes coins locally on its own.
async function claimAward(source, ctx) {
  if (typeof window.svtAward !== 'function') {
    throw new Error('Reward service unavailable. Refresh the page and try again.');
  }
  return window.svtAward(source, ctx || {});
}

async function claimAwardSafe(source, ctx, quiet) {
  try {
    return await claimAward(source, ctx);
  } catch (err) {
    console.warn('[award]', source, err);
    if (!quiet) {
      try { showToast('Reward not granted: ' + ((err && err.message) || 'please try again'), 'error'); } catch (e) {}
    }
    return null;
  }
}

function svtFandomPct() {
  try { return Number(Meta.coinBonusPct()) || 0; } catch (e) { return 0; }
}

function svtLeadBonus() {
  try { return Number(Meta.leadSpBonus()) || 0; } catch (e) { return 0; }
}

async function svtResolveDailyBox(via) {
  const res = await claimAwardSafe('dailybox', { via: via || 'daily' }, true);
  if (!res) return null;
  return { star: Number(res.extra && res.extra.star) || 1, coins: Number(res.added) || 0 };
}
let _selectedBattleOpponentId = null;  // S-07: was window.__selectedBattleOpponentId

function selectBattleOpponent(userId, gameKey, btnEl) {
  // F-02 FIX: reset selection state at start of fresh selection
  // Remove any previous selection highlighting
  document.querySelectorAll('#modalBody .select-row.selected').forEach(el => {
    el.classList.remove('selected');
    const indicator = el.querySelector('.selected-indicator');
    if (indicator) indicator.style.display = 'none';
  });
  // Mark this row as selected
  btnEl.classList.add('selected');
  const indicator = btnEl.querySelector('.selected-indicator');
  if (indicator) indicator.style.display = 'inline-block';
  // Show the confirm button
  const confirmContainer = document.getElementById('battleConfirmBtnContainer');
  if (confirmContainer) confirmContainer.style.display = 'block';
  _selectedBattleOpponentId = userId;  // S-07: module-scoped, not window-global
}

function confirmBattleStart(gameKey) {
  const opponentId = _selectedBattleOpponentId;  // S-07
  if (!opponentId) {
    if (typeof showToast === 'function') showToast('Select a friend first', 'error');
    return;
  }
  // S-05 FIX: prevent self-challenge
  if (opponentId === currentUser?.id) {
    if (typeof showToast === 'function') showToast("You can't battle yourself!", 'error');
    return;
  }
  if (typeof closeModal === 'function') closeModal();
  if (typeof startBattleWithFriend === 'function') startBattleWithFriend(opponentId, gameKey);
}

// PATCH: startSpotlightBattle and startsnakeventeenBattle were called by
// startBattleWithFriend() but were never defined, causing a ReferenceError
// that prevented battle sessions from launching. These wrappers delegate
// to the real entry-point functions openSpotlight() / opensnakeventeen().
function startSpotlightBattle(battle) {
  const spec = (battle && battle.sharedSpotlightSpec) ? battle.sharedSpotlightSpec : null;
  openSpotlight(spec);
}

function startsnakeventeenBattle(battle) {
  const spec = (battle && battle.sharedSnakeSpec) ? battle.sharedSnakeSpec : null;
  opensnakeventeen(spec);
}
function __svtBoot() {
  if (auth) {
      // Let Firebase Auth be the source of truth
      auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
          // Logged in via Firebase Auth
          if (currentUser && currentUser.id === firebaseUser.uid) {
          // Same session: refresh the profile names so the hub never shows a stale or fallback name
          try {
              const ps = await db.ref(`users/${firebaseUser.uid}`).once('value');
              const fresh = ps.val();
              if (fresh) {
                  if (fresh.displayName) currentUser.displayName = fresh.displayName;
                  if (fresh.username) currentUser.username = fresh.username;
                  localStorage.setItem('currentUser', JSON.stringify(currentUser));
              }
          } catch (e) {}
          }
          if (!currentUser || currentUser.id !== firebaseUser.uid) {
          // Refresh from DB
          const snap = await db.ref(`users/${firebaseUser.uid}`).once('value');
          const user = snap.val();
          if (user) {
              __prefetchedPlayerState = user.playerState || null; // avoid a 2nd download
              currentUser = { ...user, id: firebaseUser.uid };
              delete currentUser.playerState; // kept in GAME_STATE, not duplicated in localStorage
              delete currentUser.password; // never cache passwords
              localStorage.setItem('currentUser', JSON.stringify(currentUser));
          }
          }
          await onLoginSuccess(false);
      } else {
          // Not logged in
          showScreen('welcomeScreen');
          renderAvatars();
          startDailyResetWatcher();
      }
      // NOTE: for the logged-in branch, startDailyResetWatcher() is
      // called inside onLoginSuccess() → ensureDailyResetIfNeeded()
      // chain. If that ever changes, add it explicitly here.
      });
  } else {
      // Fallback: no Firebase, use localStorage
      (async () => {
      if (checkSession()) {
          await onLoginSuccess(false);
      } else {
          showScreen('welcomeScreen');
          renderAvatars();
      }
      })();
  }
  }
  // This script sits at the end of <body>, so the DOM is already parsed – no need
  // to wait for window.onload (which waits on every image, font and CDN file).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __svtBoot);
  else __svtBoot();