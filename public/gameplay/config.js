/* ══════════════════════════════════════════════════════════════════════════
   SVT MATCH — GAME CONFIG
   ──────────────────────────────────────────────────────────────────────────
   Every tunable number / name in the game lives in this one file.
   Edit a value, save, run `node tools/stamp.mjs` (cache-busting), deploy.
   Nothing else needs to change.

   Sections
     1  coinCaps        sanity caps applied to every coin payout
     2  games           coin rewards, level requirements, streak rules (per game)
     3  dailyBox        daily box star-upgrade chances + rewards, daily wheel
     4  idols           shop prices, rarity odds, power upgrade costs
     5  love            love XP curve, gift XP, offline love income
     6  shop            rings, gifts, avatars, profile backgrounds/titles, currencies & frames
     7  seasonPass      17-level XP progression and configurable rewards
     8  quests          idol / timed / per-game tiered quests + DAILY quests
     9  mastery         idol mastery XP + level-up rewards + fandom bonus

   NOTE: the server (api/_lib/guard.js) has its own anti-cheat ceilings
   (single earn, hourly earn, SXP per hour …). Raising a reward far beyond the
   values below can make the server clamp it — raise guard.js LIMITS to match.
   ══════════════════════════════════════════════════════════════════════════ */
const GAME_CONFIG = {

  /* ── 1. COIN CAPS (max coins a single payout of each kind may grant) ───── */
  coinCaps: {
    level: 6500,
    dailywheel: 1000,
    dailybox: 5000,
    spotlight: 3000,
    snakeventeen: 5000,
    echo: 5000,
    offlinelove: 250000,
    quest: 120000,
    season: 25000,
    mastery: 2000,
    unknown: 200000,
  },

  /* ── 2. GAMES ──────────────────────────────────────────────────────────── */
  games: {
    showtime: {
      passSeconds: 30,              // finish within this many seconds → level up
      streakSeconds: 20,            // finish UNDER this many seconds → streak +1
      baseCoins: 100,               // coins for every finished level
      streakBonusPerPoint: 10,      // + coins × current streak
      kkumaBonus: 5000,             // Kkuma matched in the level
      idolRarityBonus: { rare: 10, superrare: 20, epic: 50, mythic: 100, legendary: 500 },
    },
    spotlight: {
      passHits: 5,                  // correct taps needed → level up
      streakHits: 7,                // correct taps needed → streak +1
      coinsPerHit: 100,             // coins per correct tap
      penaltyPerMiss: 50,           // coins lost per wrong tap
      streakBonusPerPoint: 10,
      kkumaBonus: 5000,
    },
    snakeventeen: {
      startLength: 3,
      timeLimitSec: 30,
      moveIntervalMs: 300,          // lower = faster snake
      passIdolsEaten: 4,            // idols eaten → level up
      streakLength: 9,              // final length needed → streak +1
      coinsPerLength: 75,           // coins × final length
      streakBonusPerPoint: 10,
    },
    echo: {
      pads: 9,                      // idol pads on the board (all 9 are always used)
      lives: 2,
      passRounds: 5,                // rounds cleared → level up
      streakRounds: 7,              // rounds cleared → streak +1
      coinsPerRound: 70,
      perfectBonus: 150,            // Setlist mode, cleared with no life lost
      streakBonusPerPoint: 10,
      stepStartMs: 540,             // length of one flash at round 1
      stepSpeedupMs: 32,            // flashes get this much faster each round
      stepMinMs: 240,
      modes: {
        set: { name: 'Setlist', rounds: 9, blurb: 'Round 1 shows 1 idol, round 2 shows 2 … round 9 uses all 9 idols, then the show ends.' },
        endless: { name: 'Endless Encore', blurb: 'The choreo never stops growing. Chase your best round on the leaderboard.' },
      },
    },
  },

  /* ── 3. DAILY BOX + DAILY WHEEL ────────────────────────────────────────── */
  dailyBox: {
    // chance (0–1) that one tap upgrades the box FROM this star to the next
    starUpgradeChance: { 1: 0.50, 2: 0.44, 3: 0.3182, 4: 0.2857 },
    rewardCoins: { 1: 100, 2: 200, 3: 500, 4: 1000, 5: 5000 },
  },
  dailyWheelPrizes: [1000, 750, 500, 250, 100, 50, 25, 10],

  /* ── 4. IDOLS ──────────────────────────────────────────────────────────── */
  idols: {
    // These legacy gem-value numbers are divided by gemValuePerDiamondForIdols
    // to determine the final Diamond price. Idols are purchased with Diamonds only.
    shopCost: { legendary: 49999, mythic: 29999, epic: 19999, superrare: 12999, rare: 7999 },
    gemValuePerDiamondForIdols: 500,
    // relative odds of each rarity showing up in a level / spotlight / snake / echo pick
    rarityOdds: { kkuma: 1, legendary: 2, mythic: 4, epic: 13, superrare: 24, rare: 56 },
    maxPower: 17,
    // cost to go from power N → N+1 (index 0 = power 1 → 2). Must have maxPower − 1 entries.
    powerUpgradeCosts: [50, 75, 110, 170, 250, 380, 570, 855, 1280, 1920, 2880, 4325, 6487, 9730, 14595, 21895],
  },

  /* ── 5. LOVE ───────────────────────────────────────────────────────────── */
  love: {
    maxLevel: 100,
    xpBase: 250,                    // XP to go from love Lv.1 → Lv.2
    xpGrowth: 1.08,                 // each level needs this much more than the one before
    offline: {
      minLoveLevel: 5,              // married idol must reach this level to earn offline coins
      tickMinutes: 30,
      maxTicks: 48,                 // 48 × 30 min = 24 h cap
      topIdols: 3,                  // only the N highest love levels pay out
      coinsMultiplier: 51,          // coins per tick = loveLevel ^ coinsExponent × this
      coinsExponent: 1.4,
      ticksExponent: 0.75,          // diminishing returns on long absences
    },
  },

  /* ── 6. SHOP ───────────────────────────────────────────────────────────── */
  shop: {
    ringPrice: 100000,
    currency: {
      gemPackSize: 1000,
      gemPackCoinPrice: 2500000,
      gemsPerDiamond: 1000,
    },
    // Add frame PNGs under public/gameplay/imgs/assets/frames/ and update each image path here.
    frames: [
      { key: 'gold_glow', name: 'Gold Glow', priceDiamonds: 2, image: './imgs/assets/frames/gold_glow.png', border: 'linear-gradient(135deg,#fde68a,#b45309,#fef3c7)' },
      { key: 'rose_prism', name: 'Rose Prism', priceDiamonds: 3, image: './imgs/assets/frames/rose_prism.png', border: 'linear-gradient(135deg,#f9a8d4,#be185d,#fce7f3)' },
      { key: 'galaxy', name: 'Galaxy', priceDiamonds: 5, image: './imgs/assets/frames/galaxy.png', border: 'linear-gradient(135deg,#a78bfa,#312e81,#c4b5fd)' },
    ],
    gifts: [
      { key: 'svt_card_set', name: 'SVT Card Set', price: 500, xp: 10 },     // xp = love XP given
      { key: 'gose_magazine', name: 'GoSe Magazine', price: 2400, xp: 50 },
      { key: 'fml_album', name: 'FML Album', price: 4700, xp: 100 },
      { key: 'bongbongie', name: 'Bongbongie', price: 12000, xp: 250 },
      { key: 'caratbong', name: 'Caratbong', price: 45000, xp: 1000 },
    ],
    avatarPrices: {
      '1rare': 5000, '2super_rare': 10000, '3epic': 25000,
      '4mythic': 50000, '5legendary': 100000, '6ultra_legendary': 500000,
    },
    profileBackgroundPrices: {
      default: 0, sunset_dream: 3000, ocean_breeze: 3000, golden_hour: 8000,
      starlight: 8000, cherry_blossom: 15000, galaxy: 25000,
    },
    profileTitlePrices: {
      default: 0, rising_star: 2000, idol_hopeful: 2000, showtime_star: 6000,
      spotlight_ace: 6000, kkuma_whisperer: 12000, legend_of_svt: 25000,
    },
  },

  /* ── 7. BRAWL-PASS STYLE SEASON PROGRESSION ────────────────────────────── */
  seasonPass: {
    maxLevel: 17,
    xpPerRun: {
      showtime: { pass: 120, fail: 45 },
      spotlight: { pass: 110, fail: 40 },
      snakeventeen: { pass: 115, fail: 42 },
      echo: { pass: 120, fail: 45 },
    },
    // xpRequired is incremental XP needed to move from the previous pass level.
    // Rewards are claimable once their level is reached. `box` uses dailyBox's star odds and coin rewards.
    levels: [
      { xpRequired: 100, reward: { type: 'coins', amount: 1000 } },
      { xpRequired: 140, reward: { type: 'box' } },
      { xpRequired: 180, reward: { type: 'diamonds', amount: 1 } },
      { xpRequired: 220, reward: { type: 'coins', amount: 2500 } },
      { xpRequired: 260, reward: { type: 'box' } },
      { xpRequired: 300, reward: { type: 'diamonds', amount: 1 } },
      { xpRequired: 350, reward: { type: 'coins', amount: 5000 } },
      { xpRequired: 400, reward: { type: 'box' } },
      { xpRequired: 460, reward: { type: 'diamonds', amount: 2 } },
      { xpRequired: 520, reward: { type: 'coins', amount: 8000 } },
      { xpRequired: 590, reward: { type: 'box' } },
      { xpRequired: 660, reward: { type: 'diamonds', amount: 3 } },
      { xpRequired: 740, reward: { type: 'coins', amount: 15000 } },
      { xpRequired: 820, reward: { type: 'box' } },
      { xpRequired: 910, reward: { type: 'diamonds', amount: 5 } },
      { xpRequired: 1000, reward: { type: 'box' } },
      { xpRequired: 1100, reward: { type: 'diamonds', amount: 10 } },
    ],
  },

  /* ── 8. QUESTS ─────────────────────────────────────────────────────────── */
  quests: {
    // "Get <idol> N times" — one quest per idol, tiers advance after each claim
    idolMatch: {
      tiers: [5, 10, 20, 50, 100, 250, 500, 1000],
      rewardCoins: { 5: 50, 10: 100, 20: 250, 50: 750, 100: 1500, 250: 4000, 500: 9000, 1000: 20000 },
    },
    // Showtime speed quests
    timed: {
      fastSeconds: 30,
      blitzSeconds: 20,
      fastTiers: [1, 5, 10, 50, 100, 250, 500, 1000],
      blitzTiers: [1, 5, 10, 25, 50, 75, 100, 250, 500, 1000],
      fastRewardCoins: { 1: 50, 5: 100, 10: 250, 50: 500, 100: 1000, 250: 3000, 500: 7000, 1000: 15000 },
      blitzRewardCoins: { 1: 100, 5: 500, 10: 1000, 25: 2500, 50: 5000, 75: 7500, 100: 10000, 250: 25000, 500: 55000, 1000: 120000 },
    },
    // Per-game tiered quests. `stat` is read live from your save (see STAT_GETTERS in 12-quests-daily.js)
    // title: {t} is replaced with the current tier target. rewards[i] pays for tiers[i].
    tiered: [
      { id: 'showtime_levels', game: 'showtime', stat: 'showtimeLevel', title: 'Pass {t} Showtime levels',
        tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      { id: 'spotlight_levels', game: 'spotlight', stat: 'spotlightLevel', title: 'Pass {t} Spotlight levels',
        tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      { id: 'spotlight_hits', game: 'spotlight', stat: 'spotlightBestCorrect', title: 'Get {t} correct taps in one Spotlight',
        tiers: [5, 8, 10, 12, 15, 20], rewards: [100, 300, 600, 1200, 3000, 8000] },
      { id: 'snake_levels', game: 'snakeventeen', stat: 'snakeLevel', title: 'Pass {t} Snakeventeen levels',
        tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      { id: 'snake_length', game: 'snakeventeen', stat: 'snakeLongest', title: 'Grow a Snakeventeen to length {t}',
        tiers: [6, 9, 12, 16, 20, 25, 30], rewards: [100, 300, 700, 1500, 3500, 8000, 20000] },
      { id: 'echo_levels', game: 'echo', stat: 'echoLevel', title: 'Pass {t} Choreo Echo levels',
        tiers: [5, 10, 25, 50, 100, 250, 500, 1000], rewards: [100, 200, 500, 1000, 2500, 6000, 15000, 35000] },
      { id: 'echo_rounds', game: 'echo', stat: 'echoBestRounds', title: 'Clear {t} rounds in one Choreo Echo run',
        tiers: [5, 7, 9, 12, 15, 20, 30], rewards: [100, 300, 700, 1500, 3500, 8000, 20000] },
    ],
    // DAILY quests — reset every day at 00:00 UTC+8. Small rewards, quick targets.
    // metric: 'runs' = finished runs · 'passes' = runs that passed the level requirement
    //         'streaks' = runs that kept the streak alive.  game: a game key or 'any'
    daily: {
      list: [
        { id: 'dq_showtime', game: 'showtime', metric: 'passes', target: 2, coins: 30, title: 'Pass 2 Showtime levels' },
        { id: 'dq_spotlight', game: 'spotlight', metric: 'passes', target: 2, coins: 30, title: 'Pass 2 Spotlight levels' },
        { id: 'dq_snake', game: 'snakeventeen', metric: 'passes', target: 2, coins: 30, title: 'Pass 2 Snakeventeen levels' },
        { id: 'dq_echo', game: 'echo', metric: 'runs', target: 2, coins: 30, title: 'Play 2 Choreo Echo runs' },
        { id: 'dq_any_runs', game: 'any', metric: 'runs', target: 5, coins: 50, title: 'Finish 5 runs in any game' },
      ],
    },
  },

  /* ── 8. IDOL MASTERY ───────────────────────────────────────────────────── */
  mastery: {
    // cumulative idol XP needed to REACH level 1..10
    levelXp: [0, 60, 150, 280, 450, 680, 960, 1300, 1700, 2200],
    legacyXpPerMatch: 6,
    legacyXpCap: 1300,
    xpPerRun: {
      leadPass: 20, leadFail: 8,    // your Lead (equipped) idol
      deckPass: 4, deckFail: 2,     // every owned idol that took part in the run
      targetPass: 6,                // owned idol you hunted in Spotlight
    },
    levelUpCoinsPerLevel: 100,      // reaching Lv.N pays N × this many coins
    fandomCoinBonusPerPower: 0.005, // +0.5% run coins per Fandom Power
    fandomCoinBonusCap: 0.25,       // …up to +25%
  },
};