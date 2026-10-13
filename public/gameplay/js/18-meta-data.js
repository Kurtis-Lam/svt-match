/* ──────────────────────────────────────────────────────────────────────────
   META LOOP — static data
   Idol Mastery (collection + leveling)  +  Weekly Season ladder
   Tune the game here; nothing else needs to change.
   ────────────────────────────────────────────────────────────────────────── */
const META = {
  VERSION: 1,

  // Season 1 starts Monday 12 Oct 2026 (HK time). Seasons are Mon 00:00 → Sun 24:00 HKT.
  SEASON_ANCHOR_DAY: Math.floor(Date.UTC(2026, 9, 12) / 86400000),
  SEASON_NAMES: ['Sunrise', 'Starlight', 'Encore', 'Moonlit', 'Blossom', 'Aurora', 'Carnival', 'Echo'],

  // ── Idol Mastery ──────────────────────────────────────────────────────────
  // Cumulative XP needed to REACH level 1..10 (everyone owned starts at Lv.1)
  MASTERY_XP: [0, 60, 150, 280, 450, 680, 960, 1300, 1700, 2200],
  LEGACY_XP_PER_MATCH: 6,        // existing players: seed XP from lifetime matches…
  LEGACY_XP_CAP: 1300,           // …capped at Lv.8 so there's still room to grow
  XP: {
    leadPass: 20, leadFail: 8,   // Lead idol (your equipped idol), every solo run
    deckPass: 4,  deckFail: 2,   // each owned idol that appeared in a Showtime deck
    targetPass: 6,               // owned idol you were hunting in Spotlight (passed)
  },
  LEVELUP_COINS_PER_LEVEL: 100,  // Lv.N reward = 100 × N coins
  // Fandom Power = sum of mastery levels of all owned idols
  COIN_BONUS_PER_FP: 0.005,      // +0.5% run coins per Fandom Power…
  COIN_BONUS_CAP: 0.25,          // …up to +25%

  // ── Season Points (SP) ────────────────────────────────────────────────────
  SP: {
    pass: 10, fail: 3, elite: 5,        // elite = <20s Showtime / 7+ Spotlight hits / 9+ Snake length
    leadBonusEvery: 4,                  // Lead idol: +1 SP per 4 mastery levels (Lv4 → +1, Lv8 → +2)
    fullRunsPerDay: 12, overflow: 1,    // anti-grind: after 12 runs/day each run is worth 1 SP
    win: 40, tie: 20, loss: 15,         // friend battles
  },

  // Cumulative SP to reach each tier, with its reward
  TIERS: [
    { sp: 40,   name: 'Trainee',   reward: { coins: 150 } },
    { sp: 100,  name: 'Debut',     reward: { coins: 200 } },
    { sp: 180,  name: 'Rookie',    reward: { xp: 100 } },
    { sp: 280,  name: 'Rising',    reward: { coins: 300 } },
    { sp: 400,  name: 'Star',      reward: { rings: 1 } },
    { sp: 550,  name: 'Ace',       reward: { coins: 400 } },
    { sp: 730,  name: 'Headliner', reward: { xp: 250 } },
    { sp: 940,  name: 'Superstar', reward: { coins: 600 } },
    { sp: 1180, name: 'Icon',      reward: { rings: 1 } },
    { sp: 1450, name: 'Legend',    reward: { coins: 1500, xp: 300 } },
  ],

  GOALS: [
    { id: 'runs',   label: 'Complete 25 runs',        target: 25, sp: 50 },
    { id: 'wins',   label: 'Win 3 friend battles',    target: 3,  sp: 50 },
    { id: 'triple', label: 'Pass all 3 game modes',   target: 3,  sp: 40 },
  ],

  GAME_LABEL: { showtime: 'Showtime', spotlight: 'Spotlight', snakeventeen: 'Snakeventeen' },
};
