#!/usr/bin/env python3
"""
patch.py — applies three features to game.html:

  1) A star/sparkle "particle burst" animation that fires when a Showtime
     level is completed successfully (showtime, spotlight, snakeventeen).

  2) A reworked Profile page: a 1:1 square hero (background image + idol
     picture + name + title/join-date), with the existing 8 stat squares
     kept below it. The default "Carat" title is never shown; the hero
     shows the join date until the player equips a real title.

  3) A new Shop section, "Profile Cards & Titles", where players can buy
     and equip profile-card backgrounds and player titles with coins.

Usage:
    python3 patch.py [input_path] [output_path]

Defaults: input_path="game.html", output_path="game.html" (in place).
A timestamped backup of the input file is written next to it before
any changes are saved.
"""

import sys
import shutil
import time


class PatchError(RuntimeError):
    pass


def apply_replacement(text, old, new, label, required=True):
    """Replace exactly one occurrence of `old` with `new` in `text`."""
    count = text.count(old)
    if count == 0:
        if required:
            raise PatchError(f"[{label}] anchor text not found — file may already be patched "
                              f"or its source has changed upstream.")
        return text
    if count > 1:
        raise PatchError(f"[{label}] anchor text is not unique ({count} occurrences) — "
                          f"refusing to patch ambiguously.")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1) CSS for the star/sparkle particle burst
# ---------------------------------------------------------------------------

CSS_OLD = """        .app-container {
          max-width: 430px;
          margin: 0 auto;
          min-height: 100vh;
          background: linear-gradient(180deg, var(--app1) 0%, var(--app2) 100%);
          position: relative;
          overflow: hidden;
          box-shadow: 0 24px 54px rgba(15, 23, 42, 0.16);
        }
"""

CSS_NEW = """        .app-container {
          max-width: 430px;
          margin: 0 auto;
          min-height: 100vh;
          background: linear-gradient(180deg, var(--app1) 0%, var(--app2) 100%);
          position: relative;
          overflow: hidden;
          box-shadow: 0 24px 54px rgba(15, 23, 42, 0.16);
        }

        /* ── Showtime/Spotlight/Snakeventeen level-complete star burst ── */
        .svt-star-burst-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          overflow: visible;
        }

        .svt-star-particle {
          position: absolute;
          transform: translate(-50%, -50%);
          animation-name: svtStarPop;
          animation-duration: 900ms;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
          animation-fill-mode: forwards;
          animation-delay: var(--svt-delay, 0ms);
          will-change: transform, opacity;
          filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.18));
        }

        @keyframes svtStarPop {
          0% {
            transform: translate(-50%, -50%) scale(0) rotate(0deg);
            opacity: 0;
          }
          14% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.15) rotate(calc(var(--svt-rot) * 0.15));
          }
          100% {
            transform: translate(calc(-50% + var(--svt-dx)), calc(-50% + var(--svt-dy))) scale(0.25) rotate(var(--svt-rot));
            opacity: 0;
          }
        }
"""

# ---------------------------------------------------------------------------
# 2) JS utility function: fireLevelSuccessBurst()
# ---------------------------------------------------------------------------

BURST_FN_OLD = """      let __toastTimer = null;

      function showToast(message, type = 'success') {"""

BURST_FN_NEW = """      // ── Star/sparkle particle burst — plays when a Showtime, Spotlight,
      // or Snakeventeen level is completed successfully ──
      function fireLevelSuccessBurst() {
        try {
          const host = document.querySelector('.app-container') || document.body;
          const burst = document.createElement('div');
          burst.className = 'svt-star-burst-overlay';
          const glyphs = ['✨', '⭐', '🌟'];
          const count = 26;
          for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'svt-star-particle';
            const angle = Math.random() * Math.PI * 2;
            const dist = 80 + Math.random() * 170;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist - 40; // slight upward bias
            const rot = Math.random() * 720 - 360;
            const delay = Math.random() * 150;
            p.style.setProperty('--svt-dx', dx.toFixed(1) + 'px');
            p.style.setProperty('--svt-dy', dy.toFixed(1) + 'px');
            p.style.setProperty('--svt-rot', rot.toFixed(0) + 'deg');
            p.style.setProperty('--svt-delay', delay.toFixed(0) + 'ms');
            p.style.left = (46 + Math.random() * 8) + '%';
            p.style.top = (38 + Math.random() * 8) + '%';
            p.style.fontSize = (14 + Math.random() * 20).toFixed(0) + 'px';
            p.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
            burst.appendChild(p);
          }
          host.appendChild(burst);
          setTimeout(() => burst.remove(), 1300);
        } catch (e) {
          // Never let a cosmetic effect break the level-complete flow
          console.warn('fireLevelSuccessBurst failed', e);
        }
      }

      let __toastTimer = null;

      function showToast(message, type = 'success') {"""

# ---------------------------------------------------------------------------
# 3) Wire the burst into the three "level completed successfully" call sites
# ---------------------------------------------------------------------------

SHOWTIME_TRIGGER_OLD = """        const passedLevel = timeSec <= 30;
        openLevelCompleteOverlay({"""

SHOWTIME_TRIGGER_NEW = """        const passedLevel = timeSec <= 30;
        if (passedLevel) fireLevelSuccessBurst();
        openLevelCompleteOverlay({"""

SPOTLIGHT_TRIGGER_OLD = """        // BUG-G09b: passedSpotlight already declared above
        _openSlResultModal(kkumaBonus, streakBonusCoins, passedSpotlight);"""

SPOTLIGHT_TRIGGER_NEW = """        // BUG-G09b: passedSpotlight already declared above
        if (passedSpotlight) fireLevelSuccessBurst();
        _openSlResultModal(kkumaBonus, streakBonusCoins, passedSpotlight);"""

SNAKE_TRIGGER_OLD = """          openSnakeResultModal(coins, streakBonus, length, passedSnake);"""

SNAKE_TRIGGER_NEW = """          if (passedSnake) fireLevelSuccessBurst();
          openSnakeResultModal(coins, streakBonus, length, passedSnake);"""

# ---------------------------------------------------------------------------
# 4) GAME_STATE default fields for profile backgrounds / titles
# ---------------------------------------------------------------------------

STATE_DEFAULTS_OLD = """        ownedIdols: {},
        ownedAvatars: {},
        equippedAvatarKey: null,
        equippedIdolKey: null,"""

STATE_DEFAULTS_NEW = """        ownedIdols: {},
        ownedAvatars: {},
        equippedAvatarKey: null,
        equippedIdolKey: null,
        ownedProfileBackgrounds: {},
        equippedProfileBackgroundKey: null,
        ownedProfileTitles: {},
        equippedProfileTitleKey: null,"""

# ---------------------------------------------------------------------------
# 5) Persist the new fields in the save payload
# ---------------------------------------------------------------------------

SAVE_PAYLOAD_OLD = """          equippedIdolKey: GAME_STATE.equippedIdolKey || null,
          equippedAvatarKey: GAME_STATE.equippedAvatarKey || null,
          streak: GAME_STATE.streak || 0,"""

SAVE_PAYLOAD_NEW = """          equippedIdolKey: GAME_STATE.equippedIdolKey || null,
          equippedAvatarKey: GAME_STATE.equippedAvatarKey || null,
          ownedProfileBackgrounds: GAME_STATE.ownedProfileBackgrounds || {},
          equippedProfileBackgroundKey: GAME_STATE.equippedProfileBackgroundKey || null,
          ownedProfileTitles: GAME_STATE.ownedProfileTitles || {},
          equippedProfileTitleKey: GAME_STATE.equippedProfileTitleKey || null,
          streak: GAME_STATE.streak || 0,"""

# ---------------------------------------------------------------------------
# 6) Load the new fields back out of the saved payload
# ---------------------------------------------------------------------------

LOAD_PAYLOAD_OLD = """        GAME_STATE.equippedAvatarKey = payload.equippedAvatarKey || null;
        GAME_STATE.ownedAvatars = payload.ownedAvatars || {};"""

LOAD_PAYLOAD_NEW = """        GAME_STATE.equippedAvatarKey = payload.equippedAvatarKey || null;
        GAME_STATE.ownedAvatars = payload.ownedAvatars || {};
        GAME_STATE.ownedProfileBackgrounds = payload.ownedProfileBackgrounds || {};
        GAME_STATE.equippedProfileBackgroundKey = payload.equippedProfileBackgroundKey || null;
        GAME_STATE.ownedProfileTitles = payload.ownedProfileTitles || {};
        GAME_STATE.equippedProfileTitleKey = payload.equippedProfileTitleKey || null;"""

# ---------------------------------------------------------------------------
# 7) Catalogs + helpers for Profile Cards & Titles
# ---------------------------------------------------------------------------

CATALOG_OLD = """      // Love XP requirement per level (1..100)"""

CATALOG_NEW = """      // ── Profile Cards & Titles catalogs (Shop) ──
      const PROFILE_BACKGROUNDS = [{
        key: 'default',
        label: 'Classic',
        price: 0,
        css: 'linear-gradient(135deg,var(--theme1),var(--theme2))'
      }, {
        key: 'sunset_dream',
        label: 'Sunset Dream',
        price: 3000,
        css: 'linear-gradient(135deg,#fbc2eb,#a6c1ee)'
      }, {
        key: 'ocean_breeze',
        label: 'Ocean Breeze',
        price: 3000,
        css: 'linear-gradient(135deg,#a8edea,#fed6e3)'
      }, {
        key: 'golden_hour',
        label: 'Golden Hour',
        price: 8000,
        css: 'linear-gradient(135deg,#f6d365,#fda085)'
      }, {
        key: 'starlight',
        label: 'Starlight',
        price: 8000,
        css: 'linear-gradient(135deg,#30cfd0,#330867)'
      }, {
        key: 'cherry_blossom',
        label: 'Cherry Blossom',
        price: 15000,
        css: 'linear-gradient(135deg,#ffdde1,#ee9ca7)'
      }, {
        key: 'galaxy',
        label: 'Galaxy',
        price: 25000,
        css: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)'
      }, ];

      const PROFILE_TITLES = [{
        key: 'default',
        label: 'Carat',
        price: 0
      }, {
        key: 'rising_star',
        label: '🌟 Rising Star',
        price: 2000
      }, {
        key: 'idol_hopeful',
        label: '💫 Idol Hopeful',
        price: 2000
      }, {
        key: 'showtime_star',
        label: '🎤 Showtime Star',
        price: 6000
      }, {
        key: 'spotlight_ace',
        label: '🔎 Spotlight Ace',
        price: 6000
      }, {
        key: 'kkuma_whisperer',
        label: '🐾 Kkuma Whisperer',
        price: 12000
      }, {
        key: 'legend_of_svt',
        label: '👑 Legend of SVT',
        price: 25000
      }, ];

      function equippedProfileBackgroundCss() {
        const key = GAME_STATE.equippedProfileBackgroundKey;
        const bg = PROFILE_BACKGROUNDS.find(b => b.key === key);
        return bg ? bg.css : PROFILE_BACKGROUNDS[0].css;
      }

      function equippedProfileTitleLabel() {
        const key = GAME_STATE.equippedProfileTitleKey;
        const t = PROFILE_TITLES.find(x => x.key === key);
        return t ? t.label : PROFILE_TITLES[0].label;
      }

      // Love XP requirement per level (1..100)"""

# ---------------------------------------------------------------------------
# 8) Profile data objects: add bgCss / titleLabel / hasCustomTitle
# ---------------------------------------------------------------------------

PDATA_ME_OLD = """            showtimeLevel: GAME_STATE.level ?? 0,
            spotlightLevel: GAME_STATE.spotlightLevel ?? 0,
            joinDate: currentUser.joinDate || '—',
          };
        } else {"""

PDATA_ME_NEW = """            showtimeLevel: GAME_STATE.level ?? 0,
            spotlightLevel: GAME_STATE.spotlightLevel ?? 0,
            joinDate: currentUser.joinDate || '—',
            bgCss: equippedProfileBackgroundCss(),
            titleLabel: equippedProfileTitleLabel(),
            hasCustomTitle: !!(GAME_STATE.equippedProfileTitleKey && GAME_STATE.equippedProfileTitleKey !== 'default'),
          };
        } else {"""

PDATA_FRIEND_OLD = """            showtimeLevel: ps.level ?? 0,
            spotlightLevel: ps.spotlightLevel ?? 0,
            joinDate: u.joinDate || '—',
          };
        }"""

PDATA_FRIEND_NEW = """            showtimeLevel: ps.level ?? 0,
            spotlightLevel: ps.spotlightLevel ?? 0,
            joinDate: u.joinDate || '—',
            bgCss: (PROFILE_BACKGROUNDS.find(b => b.key === ps.equippedProfileBackgroundKey) || PROFILE_BACKGROUNDS[0]).css,
            titleLabel: (PROFILE_TITLES.find(t => t.key === ps.equippedProfileTitleKey) || PROFILE_TITLES[0]).label,
            hasCustomTitle: !!(ps.equippedProfileTitleKey && ps.equippedProfileTitleKey !== 'default'),
          };
        }"""

# ---------------------------------------------------------------------------
# 9) The profile hero markup itself: 1:1 square card
# ---------------------------------------------------------------------------

HERO_OLD = """        const winRate = (p.battleWins + p.battleLosses > 0) ? Math.round((p.battleWins / (p.battleWins + p.battleLosses)) * 100) + '%' : '—';
        // 3. Fixed the quotes and backticks here
        const modalTitle = isMe ? 'My Profile' : `${escapeHtml(p.displayName)}'s Profile`;  // S-02: escape in title
        openModal(modalTitle, `
          <div style="max-height:70vh; overflow-y:auto; padding-right:4px;">

          <div style="
            background:linear-gradient(135deg,var(--theme1),var(--theme2));
            border-radius:22px;padding:18px 16px 22px;
            margin-bottom:14px;position:relative;overflow:hidden;
          ">
            <div style="position:absolute;inset:0;background:repeating-linear-gradient(
              45deg,rgba(255,255,255,0.06) 0px,rgba(255,255,255,0.06) 8px,transparent 8px,transparent 20px
            );pointer-events:none;"></div>
            <div style="position:relative;display:flex;align-items:center;gap:14px;">
              <div style="position:relative;flex:0 0 auto;">
                <img src="${p.avatarSrc}" alt="avatar" style="
                  width:80px;height:80px;border-radius:20px;
                  border:3px solid rgba(255,255,255,0.9);
                  box-shadow:0 12px 28px rgba(0,0,0,0.2);
                  object-fit:cover;display:block;"/>
                ${p.marriedCount > 0 ? `` : ''}
              </div>
              <div style="min-width:0;">
                <div style="font-size:20px;font-weight:900;color:#0f172a;line-height:1.1;">${escapeHtml(p.displayName)}</div>
                <div style="font-size:12px;font-weight:700;color:rgba(15,23,42,0.65);margin-top:3px;">@${escapeHtml(p.username)}</div>
                <div style="
                  display:inline-flex;align-items:center;gap:5px;
                  margin-top:8px;padding:4px 10px;border-radius:9999px;
                  background:rgba(255,255,255,0.35);
                  border:1px solid rgba(255,255,255,0.6);
                  font-size:11px;font-weight:800;color:#0f172a;
                ">🎮 Joined ${p.joinDate}</div>
              </div>
            </div>

            <div style="display:flex;gap:8px;margin-top:14px;position:relative;">
              <div style="flex:1;background:rgba(255,255,255,0.28);border:1px solid rgba(255,255,255,0.5);border-radius:14px;padding:8px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:900;color:#0f172a;">${p.gamesPlayed}</div>
                <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">GAMES PLAYED</div>
              </div>
              <div style="flex:1;background:rgba(255,255,255,0.28);border:1px solid rgba(255,255,255,0.5);border-radius:14px;padding:8px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:900;color:#0f172a;">${p.totalCoinsEarned.toLocaleString()}</div>
                <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">NET INCOME</div>
              </div>
              <div style="flex:1;background:rgba(255,255,255,0.28);border:1px solid rgba(255,255,255,0.5);border-radius:14px;padding:8px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:900;color:#0f172a;">${winRate}</div>
                <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">WIN RATE</div>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">"""

HERO_NEW = """        const winRate = (p.battleWins + p.battleLosses > 0) ? Math.round((p.battleWins / (p.battleWins + p.battleLosses)) * 100) + '%' : '—';
        // 3. Fixed the quotes and backticks here
        const modalTitle = isMe ? 'My Profile' : `${escapeHtml(p.displayName)}'s Profile`;  // S-02: escape in title
        openModal(modalTitle, `
          <div style="max-height:70vh; overflow-y:auto; padding-right:4px;">

          <!-- Profile Hero: 1:1 square card — background + idol picture + name + title -->
          <div style="
            position:relative;width:100%;aspect-ratio:1/1;border-radius:24px;
            overflow:hidden;margin-bottom:14px;
            box-shadow:0 14px 34px rgba(0,0,0,0.18);
            background:${p.bgCss};
          ">
            <div style="position:absolute;inset:0;background:repeating-linear-gradient(
              45deg,rgba(255,255,255,0.06) 0px,rgba(255,255,255,0.06) 8px,transparent 8px,transparent 20px
            );pointer-events:none;"></div>
            <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,0.55) 100%);"></div>

            <div style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:44%;aspect-ratio:1/1;">
              <img src="${p.avatarSrc}" alt="idol picture" style="
                width:100%;height:100%;border-radius:50%;
                border:4px solid rgba(255,255,255,0.95);
                box-shadow:0 12px 28px rgba(0,0,0,0.28);
                object-fit:cover;display:block;"/>
            </div>

            <div style="position:absolute;left:0;right:0;bottom:16px;text-align:center;padding:0 12px;">
              <div style="font-size:21px;font-weight:900;color:#ffffff;line-height:1.1;text-shadow:0 2px 8px rgba(0,0,0,0.45);">${escapeHtml(p.displayName)}</div>
              <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.85);margin-top:2px;text-shadow:0 1px 4px rgba(0,0,0,0.4);">@${escapeHtml(p.username)}</div>
              <div style="
                display:inline-flex;align-items:center;gap:5px;
                margin-top:8px;padding:4px 12px;border-radius:9999px;
                background:rgba(255,255,255,0.28);
                border:1px solid rgba(255,255,255,0.6);
                font-size:11px;font-weight:800;color:#ffffff;
                text-shadow:0 1px 3px rgba(0,0,0,0.35);
              ">${p.hasCustomTitle ? p.titleLabel : `🎮 Joined ${p.joinDate}`}</div>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:14px;">
            <div class="glass-card" style="flex:1;border-radius:14px;padding:8px 10px;text-align:center;">
              <div style="font-size:18px;font-weight:900;color:#0f172a;">${p.gamesPlayed}</div>
              <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">GAMES PLAYED</div>
            </div>
            <div class="glass-card" style="flex:1;border-radius:14px;padding:8px 10px;text-align:center;">
              <div style="font-size:18px;font-weight:900;color:#0f172a;">${p.totalCoinsEarned.toLocaleString()}</div>
              <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">NET INCOME</div>
            </div>
            <div class="glass-card" style="flex:1;border-radius:14px;padding:8px 10px;text-align:center;">
              <div style="font-size:18px;font-weight:900;color:#0f172a;">${winRate}</div>
              <div style="font-size:9px;font-weight:800;color:rgba(15,23,42,0.7);margin-top:1px;">WIN RATE</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">"""

# ---------------------------------------------------------------------------
# 10) Shop: add "Profile Cards & Titles" landing entry + full sub-screen
# ---------------------------------------------------------------------------

SHOP_OLD = """          <button class="hub-action-card rounded-2xl p-5 flex items-center gap-4 w-full"
              onclick="openShopAvatars()">
              <div class="hub-action-icon-wrap" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));overflow:hidden;">
              <img alt="Avatars" class="hub-action-icon" src="./imgs/assets/shop_avatars.png" style="object-fit:contain;"/>
              </div>
              <div class="text-left min-w-0">
              <p class="font-bold text-gray-800">Avatars</p>
              <p class="text-xs text-gray-500">Customize your profile picture</p>
              </div>
              <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
          </button>
          </div>
        `;
      }"""

SHOP_NEW = """          <button class="hub-action-card rounded-2xl p-5 flex items-center gap-4 w-full"
              onclick="openShopAvatars()">
              <div class="hub-action-icon-wrap" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));overflow:hidden;">
              <img alt="Avatars" class="hub-action-icon" src="./imgs/assets/shop_avatars.png" style="object-fit:contain;"/>
              </div>
              <div class="text-left min-w-0">
              <p class="font-bold text-gray-800">Avatars</p>
              <p class="text-xs text-gray-500">Customize your profile picture</p>
              </div>
              <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
          </button>

          <button class="hub-action-card rounded-2xl p-5 flex items-center gap-4 w-full"
              onclick="openShopProfileCards()">
              <div class="hub-action-icon-wrap" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));overflow:hidden;">
              <i class="fas fa-id-badge" style="color:#fff;font-size:20px;"></i>
              </div>
              <div class="text-left min-w-0">
              <p class="font-bold text-gray-800">Profile Cards &amp; Titles</p>
              <p class="text-xs text-gray-500">Backgrounds &amp; titles for your profile</p>
              </div>
              <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
          </button>
          </div>
        `;
      }

      let _profileShopTab = 'backgrounds';

      function openShopProfileCards(tab) {
        _shopPreviousPage = 'landing';
        _profileShopTab = tab || _profileShopTab || 'backgrounds';
        const area = document.getElementById('shopScrollArea');
        area.innerHTML = `
          <div class="glass-card rounded-2xl p-4">
            <div class="text-sm font-extrabold text-gray-900">Profile Cards &amp; Titles</div>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button id="profileShopTabBg" class="btn-soft-sm" style="flex:1;" onclick="openShopProfileCards('backgrounds')">🖼️ Backgrounds</button>
              <button id="profileShopTabTitle" class="btn-soft-sm" style="flex:1;" onclick="openShopProfileCards('titles')">🏷️ Titles</button>
            </div>
            <div style="display:flex;align-items:center;gap:5px;margin-top:10px;font-size:12px;font-weight:800;color:#0f172a;">
              Balance: <span id="profileShopCoins">${GAME_STATE.coins.toLocaleString()}</span>
              <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">
            </div>
            <div class="mt-3" id="profileShopGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;"></div>
          </div>
        `;
        const bgTabBtn = document.getElementById('profileShopTabBg');
        const titleTabBtn = document.getElementById('profileShopTabTitle');
        if (_profileShopTab === 'backgrounds') {
          bgTabBtn.style.outline = '2px solid #3b82f6';
          titleTabBtn.style.outline = 'none';
        } else {
          titleTabBtn.style.outline = '2px solid #3b82f6';
          bgTabBtn.style.outline = 'none';
        }
        renderProfileShopGrid();
      }

      function renderProfileShopGrid() {
        const grid = document.getElementById('profileShopGrid');
        if (!grid) return;
        grid.innerHTML = '';
        if (_profileShopTab === 'backgrounds') {
          PROFILE_BACKGROUNDS.forEach(bg => {
            const owned = bg.key === 'default' || !!(GAME_STATE.ownedProfileBackgrounds || {})[bg.key];
            const equipped = (GAME_STATE.equippedProfileBackgroundKey || 'default') === bg.key;
            const card = document.createElement('button');
            card.style.cssText = `
              border-radius:16px;padding:8px;background:rgba(255,255,255,0.9);
              border:${equipped ? '3px solid #3b82f6' : '2px solid rgba(0,0,0,0.06)'};
              box-shadow:0 8px 20px rgba(0,0,0,0.1);display:flex;flex-direction:column;
              align-items:center;gap:6px;
            `;
            card.innerHTML = `
              <div style="width:100%;aspect-ratio:1;border-radius:12px;background:${bg.css};border:2px solid rgba(255,255,255,0.6);"></div>
              <div style="font-size:10px;font-weight:800;color:#0f172a;text-align:center;line-height:1.1;">${bg.label}</div>
              <div style="font-size:9px;font-weight:900;color:${equipped ? '#1d4ed8' : owned ? '#16a34a' : '#64748b'};display:flex;align-items:center;gap:3px;">
                ${equipped ? '✓ Equipped' : owned ? 'Owned — tap to equip' : bg.price.toLocaleString() + ' '}
                ${(!equipped && !owned) ? '<img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">' : ''}
              </div>
            `;
            card.onclick = () => {
              if (owned) {
                GAME_STATE.equippedProfileBackgroundKey = equipped ? 'default' : bg.key;
                savePlayerState();
                renderProfileShopGrid();
                showToast(equipped ? 'Background unequipped' : 'Background equipped!', 'success');
              } else {
                confirmProfileCosmeticPurchase('background', bg);
              }
            };
            grid.appendChild(card);
          });
        } else {
          PROFILE_TITLES.forEach(t => {
            const owned = t.key === 'default' || !!(GAME_STATE.ownedProfileTitles || {})[t.key];
            const equipped = (GAME_STATE.equippedProfileTitleKey || 'default') === t.key;
            const card = document.createElement('button');
            card.style.cssText = `
              border-radius:16px;padding:12px 8px;background:rgba(255,255,255,0.9);
              border:${equipped ? '3px solid #3b82f6' : '2px solid rgba(0,0,0,0.06)'};
              box-shadow:0 8px 20px rgba(0,0,0,0.1);display:flex;flex-direction:column;
              align-items:center;justify-content:center;gap:6px;min-height:76px;
            `;
            card.innerHTML = `
              <div style="font-size:12px;font-weight:900;color:#0f172a;text-align:center;line-height:1.2;">${t.label}</div>
              <div style="font-size:9px;font-weight:900;color:${equipped ? '#1d4ed8' : owned ? '#16a34a' : '#64748b'};display:flex;align-items:center;gap:3px;">
                ${equipped ? '✓ Equipped' : owned ? 'Owned — tap to equip' : t.price.toLocaleString() + ' '}
                ${(!equipped && !owned) ? '<img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">' : ''}
              </div>
            `;
            card.onclick = () => {
              if (owned) {
                GAME_STATE.equippedProfileTitleKey = equipped ? 'default' : t.key;
                savePlayerState();
                renderProfileShopGrid();
                showToast(equipped ? 'Title unequipped' : 'Title equipped!', 'success');
              } else {
                confirmProfileCosmeticPurchase('title', t);
              }
            };
            grid.appendChild(card);
          });
        }
      }

      function confirmProfileCosmeticPurchase(kind, item) {
        openModal(kind === 'background' ? 'Buy Background?' : 'Buy Title?', `
          <div class="glass-card rounded-2xl p-4 text-center">
            ${kind === 'background'
              ? `<div style="width:100px;height:100px;border-radius:18px;margin:0 auto 10px;background:${item.css};"></div>`
              : ''}
            <p style="font-weight:900;color:#0f172a;">${item.label}</p>
            <p style="font-size:12px;color:#64748b;font-weight:700;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:4px;">${item.price.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></p>
          </div>
          <div class="grid grid-cols-2 gap-3 pt-2">
            <button class="btn-confirm-no" onclick="closeModal()">Cancel</button>
            <button class="btn-confirm-yes" onclick="purchaseProfileCosmetic('${kind}','${item.key}',${item.price})">Confirm</button>
          </div>
        `);
      }

      let __profileCosmeticPurchaseInProgress = false;
      async function purchaseProfileCosmetic(kind, key, price) {
        // Guard against double-tap double-deduct
        if (__profileCosmeticPurchaseInProgress) return;
        __profileCosmeticPurchaseInProgress = true;
        closeModal();
        if (GAME_STATE.coins < price) {
          showToast('Not enough coins', 'error');
          __profileCosmeticPurchaseInProgress = false;
          return;
        }
        if (kind === 'background') {
          if (GAME_STATE.ownedProfileBackgrounds && GAME_STATE.ownedProfileBackgrounds[key]) {
            showToast('Background already owned', 'info');
            __profileCosmeticPurchaseInProgress = false;
            return;
          }
          GAME_STATE.coins -= price;
          GAME_STATE.ownedProfileBackgrounds = GAME_STATE.ownedProfileBackgrounds || {};
          GAME_STATE.ownedProfileBackgrounds[key] = true;
          GAME_STATE.equippedProfileBackgroundKey = key;
        } else {
          if (GAME_STATE.ownedProfileTitles && GAME_STATE.ownedProfileTitles[key]) {
            showToast('Title already owned', 'info');
            __profileCosmeticPurchaseInProgress = false;
            return;
          }
          GAME_STATE.coins -= price;
          GAME_STATE.ownedProfileTitles = GAME_STATE.ownedProfileTitles || {};
          GAME_STATE.ownedProfileTitles[key] = true;
          GAME_STATE.equippedProfileTitleKey = key;
        }
        renderHub();
        const coinsEl = document.getElementById('profileShopCoins');
        if (coinsEl) coinsEl.textContent = GAME_STATE.coins.toLocaleString();
        await savePlayerState();
        __profileCosmeticPurchaseInProgress = false;
        showToast((kind === 'background' ? 'Background' : 'Title') + ' purchased & equipped!', 'success');
        renderProfileShopGrid();
      }"""


REPLACEMENTS = [
    (CSS_OLD, CSS_NEW, "star-burst CSS"),
    (BURST_FN_OLD, BURST_FN_NEW, "fireLevelSuccessBurst() JS function"),
    (SHOWTIME_TRIGGER_OLD, SHOWTIME_TRIGGER_NEW, "Showtime success trigger"),
    (SPOTLIGHT_TRIGGER_OLD, SPOTLIGHT_TRIGGER_NEW, "Spotlight success trigger"),
    (SNAKE_TRIGGER_OLD, SNAKE_TRIGGER_NEW, "Snakeventeen success trigger"),
    (STATE_DEFAULTS_OLD, STATE_DEFAULTS_NEW, "GAME_STATE defaults"),
    (SAVE_PAYLOAD_OLD, SAVE_PAYLOAD_NEW, "save payload fields"),
    (LOAD_PAYLOAD_OLD, LOAD_PAYLOAD_NEW, "load payload fields"),
    (CATALOG_OLD, CATALOG_NEW, "PROFILE_BACKGROUNDS/PROFILE_TITLES catalogs"),
    (PDATA_ME_OLD, PDATA_ME_NEW, "profile data (me)"),
    (PDATA_FRIEND_OLD, PDATA_FRIEND_NEW, "profile data (friend)"),
    (HERO_OLD, HERO_NEW, "profile hero markup"),
    (SHOP_OLD, SHOP_NEW, "shop landing + Profile Cards & Titles screen"),
]


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else "game.html"
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path

    with open(input_path, "r", encoding="utf-8") as f:
        text = f.read()

    for old, new, label in REPLACEMENTS:
        text = apply_replacement(text, old, new, label)

    if output_path == input_path:
        backup_path = f"{input_path}.bak-{int(time.time())}"
        shutil.copy2(input_path, backup_path)
        print(f"Backup written to {backup_path}")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"Patched successfully -> {output_path}")


if __name__ == "__main__":
    try:
        main()
    except PatchError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)