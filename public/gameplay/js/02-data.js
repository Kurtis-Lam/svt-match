function hkDayKey(ts = Date.now()) {
  // G-07: single correct UTC+8 offset — no double round-trip
  const hktDateObj = new Date(ts + 8 * 60 * 60 * 1000);
  const y = hktDateObj.getUTCFullYear();
  const m = String(hktDateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(hktDateObj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startSecondsOnlineTicker() {
  stopSecondsOnlineTicker();
  if (!db || !currentUser?.id) return;
  __secondsOnlineInterval = setInterval(async () => {
    try {
      const day = hkDayKey();
      const ref = db.ref(`users/${currentUser.id}/analytics/secondsOnline/${day}`);
      const snap = await ref.once('value');
      const cur = Number(snap.val() || 0);
      await ref.set(cur + 1);
      if ((cur % 5) === 0) {
        await db.ref(`users/${currentUser.id}/analytics/lastSeenAt`).set(Date.now()).catch(() => {});
      }
    } catch (e) {}
  }, 1000);
}

function stopSecondsOnlineTicker() {
  if (__secondsOnlineInterval) {
    clearInterval(__secondsOnlineInterval);
    __secondsOnlineInterval = null;
  }
}
window.addEventListener('beforeunload', () => {
  stopSecondsOnlineTicker();
  // Auto‑resolve any active battle with worst score if the player leaves mid‑game
  const act = GAME_STATE.battles?.active;
  if (act) {
    if (act.game === 'spotlight') {
      // finalizeSpotlightBattle is async, but we must run it synchronously‑ish before closing.
      // Use a separate synchronous flag to mark it for next login.
      GAME_STATE._abandonedBattle = act;
    } else if (act.game === 'snakeventeen') {
      GAME_STATE._abandonedBattle = act;
    } else {
      GAME_STATE._abandonedBattle = act;
    }
    __blockSavesUntil = 0; // allow immediate save in beforeunload if possible
    savePlayerStateLocal(); // save the flag locally
  }
  if (GAME_STATE.inLevel && !GAME_STATE.levelJustFinished) {
    __blockSavesUntil = Date.now() + 60_000;
  }
});
const IDOLS = [{
  key: "scoups",
  display: "S.Coups"
}, {
  key: "jeonghan",
  display: "Jeonghan"
}, {
  key: "joshua",
  display: "Joshua"
}, {
  key: "jun",
  display: "Jun"
}, {
  key: "hoshi",
  display: "Hoshi"
}, {
  key: "wonwoo",
  display: "Wonwoo"
}, {
  key: "woozi",
  display: "Woozi"
}, {
  key: "dk",
  display: "DK"
}, {
  key: "mingyu",
  display: "Mingyu"
}, {
  key: "the8",
  display: "The8"
}, {
  key: "seungkwan",
  display: "Seungkwan"
}, {
  key: "vernon",
  display: "Vernon"
}, {
  key: "dino",
  display: "Dino"
}, ];
const IDOL_IMAGES = {
  dino: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  dk: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  hoshi: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  jeonghan: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  joshua: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  jun: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  kkuma: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  mingyu: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  scoups: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg", "7.jpg", "8.jpg", "9.jpg", "10.jpg"],
  seungkwan: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  the8: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  vernon: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  wonwoo: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
  woozi: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"],
};
const IDOL_RARITY = {
  kkuma: "kkuma",
  scoups: "legendary",
  mingyu: "mythic",
  seungkwan: "mythic",
  hoshi: "epic",
  joshua: "epic",
  woozi: "superrare",
  vernon: "superrare",
  dino: "superrare",
  jeonghan: "rare",
  jun: "rare",
  wonwoo: "rare",
  dk: "rare",
  the8: "rare",
};
const RARITY_ODDS = {
  kkuma: 1,
  legendary: 2,
  mythic: 4,
  epic: 13,
  superrare: 24,
  rare: 56
};
const RARITY_BORDER_CLASS = {
  legendary: "rarity-legendary",
  mythic: "rarity-mythic",
  epic: "rarity-epic",
  superrare: "rarity-superrare",
  rare: "rarity-rare",
  kkuma: "rarity-kkuma",
};
const RARITY_ORDER = ["legendary", "mythic", "epic", "superrare", "rare"];
const QUEST_TIERS = [5, 10, 20, 50, 100, 250, 500, 1000];
const QUEST_REWARD_COINS = {
  5: 50,
  10: 100,
  20: 250,
  50: 750,
  100: 1500,
  250: 4000,
  500: 9000,
  1000: 20000
};
const QUEST_UNDER_30_TIERS = [1, 5, 10, 50, 100, 250, 500, 1000];
const QUEST_UNDER_20_TIERS = [1, 5, 10, 25, 50, 75, 100, 250, 500, 1000];
const TIMED_QUEST_REWARD_COINS = {
  under30: {
    1: 50,
    5: 100,
    10: 250,
    50: 500,
    100: 1000,
    250: 3000,
    500: 7000,
    1000: 15000
  },
  under20: {
    1: 100,
    5: 500,
    10: 1000,
    25: 2500,
    50: 5000,
    75: 7500,
    100: 10000,
    250: 25000,
    500: 55000,
    1000: 120000
  }
};
const IDOL_DIAMOND_CONVERSION = Math.max(1, Number(GAME_CONFIG.shop?.diamondConversionCoinsPerDiamond) || 500);
const IDOL_SHOP_COST = { kkuma: 5, ...Object.fromEntries(Object.entries(GAME_CONFIG.idols.shopCostCoins || { legendary: 49999, mythic: 29999, epic: 19999, superrare: 12999, rare: 7999 }).map(([rarity, coinCost]) => [rarity, Math.max(1, Math.ceil(Number(coinCost) / IDOL_DIAMOND_CONVERSION))])) };
const BATTLE_GAMES = {
  showtime: {
    name: 'Showtime',
    icon: './imgs/assets/hub_play_showtime.png',
    levelKey: 'level'
  },
  spotlight: {
    name: 'Spotlight',
    icon: './imgs/assets/hub_play_props.png',
    levelKey: 'spotlightLevel'
  },
  snakeventeen: {
    name: 'Snakeventeen',
    icon: './imgs/assets/hub_snake.png',
    levelKey: 'snakeventeenLevel'
  },
};

function battleGameLabel(battle) {
  const g = BATTLE_GAMES[battle.game || 'showtime'];
  return g ? g.name : 'Showtime';
}

function battleGameIconHtml(battle) {
  const g = BATTLE_GAMES[battle.game || 'showtime'];
  return g ? `<img src="${g.icon}" style="width:1em;height:1em;vertical-align:middle;margin-right:4px;">` : '';
}
const IDOL_THEME = {
  scoups: ["#bfdbfe", "#fecaca"],
  jeonghan: ["#fbcfe8", "#bae6fd"],
  joshua: ["#99f6e4", "#bae6fd"],
  jun: ["#e9d5ff", "#fed7aa"],
  hoshi: ["#fecaca", "#fed7aa"],
  wonwoo: ["#d1d5db", "#e9d5ff"],
  woozi: ["#fef08a", "#fecaca"],
  dk: ["#bbf7d0", "#fef08a"],
  mingyu: ["#f8fafc", "#dbeafe"],
  the8: ["#fed7aa", "#bbf7d0"],
  seungkwan: ["#d9f99d", "#fed7aa"],
  vernon: ["#f5d0fe", "#e5e7eb"],
  dino: ["#e9d5ff", "#bbf7d0"],
};
const DAILY_WHEEL_SEGMENTS = [{
  label: 'S.Coups',
  colors: IDOL_THEME.scoups
}, {
  label: 'Jeonghan',
  colors: IDOL_THEME.jeonghan
}, {
  label: 'Joshua',
  colors: IDOL_THEME.joshua
}, {
  label: 'Jun',
  colors: IDOL_THEME.jun
}, {
  label: 'Hoshi',
  colors: IDOL_THEME.hoshi
}, {
  label: 'Wonwoo',
  colors: IDOL_THEME.wonwoo
}, {
  label: 'Woozi',
  colors: IDOL_THEME.woozi
}, {
  label: 'DK',
  colors: IDOL_THEME.dk
}, {
  label: 'Mingyu',
  colors: IDOL_THEME.mingyu
}, {
  label: 'The8',
  colors: IDOL_THEME.the8
}, {
  label: 'Seungkwan',
  colors: IDOL_THEME.seungkwan
}, {
  label: 'Vernon',
  colors: IDOL_THEME.vernon
}, {
  label: 'Dino',
  colors: IDOL_THEME.dino
}, ];
const POWER_UPGRADE_COSTS = [50, 75, 110, 170, 250, 380, 570, 855, 1280, 1920, 2880, 4325, 6487, 9730, 14595, 21895];
// ABILITIES...
const ABILITIES = {
  scoups_whistle: {
    id: "scoups_whistle",
    ownerIdol: "scoups",
    type: "unstackable",
    label: "The General's Whistle",
    description: "Reveals all unmatched cards for {duration}s. Timer freezes.",
    effectAtPower: (lvl) => ({
      durationSec: 4 + (lvl - 1) * 0.3
    })
  },
  seungkwan_rewind: {
    id: "seungkwan_rewind",
    ownerIdol: "seungkwan",
    type: "instantaneous",
    label: "BOOYAH Rewind",
    description: "Rewinds timer to {target}s. Only usable if timer exceeds rewind time.",
    effectAtPower: (lvl) => ({
      targetSec: Math.max(0, 19 - (lvl - 1) * 0.5)
    })
  },
  joshua_rain: {
    id: "joshua_rain",
    ownerIdol: "joshua",
    type: "stackable",
    label: "Sunday Morning Rain",
    description: "Timer runs at {ratePercent}% speed for 5 seconds.",
    effectAtPower: (lvl) => {
      const ratePercent = Math.max(0, 84 - (lvl - 1) * 2);
      return {
        durationSec: 5,
        rate: ratePercent / 100
      };
    }
  },
  mingyu_aura: {
    id: "mingyu_aura",
    ownerIdol: "mingyu",
    type: "unstackable",
    label: "Golden Aura",
    description: "Reveals half of unmatched cards for {duration}s, shuffles them, then hides them. Timer freezes.",
    effectAtPower: (lvl) => ({
      durationSec: 3 + (lvl - 1) * 0.3
    })
  },
  jeonghan_cheat: {
    id: "jeonghan_cheat",
    ownerIdol: "jeonghan",
    type: "stackable",
    label: "Loki's Cheat Code",
    description: "Freezes timer for {duration}s.",
    effectAtPower: (lvl) => ({
      durationSec: 2 + (lvl - 1) * 0.3
    })
  },
  dk_slash: {
    id: "dk_slash",
    ownerIdol: "dk",
    type: "unstackable",
    label: "X-Calibur Slash",
    description: "Reveals calmest row left→right over {total}s. Timer pauses.",
    effectAtPower: (lvl) => ({
      totalSec: 5 + (lvl - 1) * 0.2
    })
  },
  vernon_vibe: {
    id: "vernon_vibe",
    ownerIdol: "vernon",
    type: "unstackable",
    label: "Vibe Check",
    description: "Tap 1 unflipped card. Reveals adjacent cards (cross) for {duration}s. Timer pauses.",
    effectAtPower: (lvl) => ({
      durationSec: 3 + (lvl - 1) * 0.2
    })
  },
  dino_history: {
    id: "dino_history",
    ownerIdol: "dino",
    type: "unstackable",
    label: "History Maker",
    description: "Reveals last 2 mismatched cards and their actual partners for {duration}s. Timer freezes.",
    effectAtPower: (lvl) => ({
      durationSec: 2 + (lvl - 1) * 0.2  // G-09 FIX: raised base from 1s to 2s
    })
  },
  hoshi_leap: {
    id: "hoshi_leap",
    ownerIdol: "hoshi",
    type: "unstackable",
    label: "Tiger's Leap",
    description: "Tap 1 unflipped card. Tiger auto-matches its pair. Timer freezes during animation.",
    effectAtPower: (lvl) => ({
      matchTimeSec: Math.max(0.5, 2 - (lvl - 1) * 0.1)
    })
  },
  woozi_reset: {
    id: "woozi_reset",
    ownerIdol: "woozi",
    type: "instantaneous",
    label: "Factory Reset",
    description: "Reorders 1/4 of remaining unmatched cards (no reveal).",
    effectAtPower: (lvl) => ({
      fraction: lvl >= 17 ? 1 / 3 : 1 / 4
    }),
  },
  jun_miracle: {
    id: "jun_miracle",
    ownerIdol: "jun",
    type: "unstackable",
    label: "Moonwalker's Miracle",
    description: "Removes one random matching pair. Fly-out: {ms}ms.",
    effectAtPower: (lvl) => ({
      ms: Math.max(500, 2000 - (lvl - 1) * 100)
    })
  },
  wonwoo_hack: {
    id: "wonwoo_hack",
    ownerIdol: "wonwoo",
    type: "unstackable",
    label: "System Hack",
    description: "3 charges, each tap reveals that card's pair for {highlightSec}s. Timer pauses until all ends.",
    effectAtPower: (lvl) => ({
      charges: 3,
      highlightSec: 1 + (lvl - 1) * 0.06
    })
  },
  the8_tea: {
    id: "the8_tea",
    ownerIdol: "the8",
    type: "instantaneous",
    label: "Tea time",
    description: "Permanently reveals {count} unflipped card(s) face-up until matched. Timer does not freeze.",
    effectAtPower: (lvl) => ({
      count: lvl >= 17 ? 4 : lvl >= 10 ? 3 : lvl >= 5 ? 2 : 1
    })
  },
};
// ══ PATCH S-01: escapeHtml – defined early so all renderers can use it ══
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ══ END PATCH S-01 ══
const GAME_STATE = {
  level: 0,
  coins: 0,
  diamonds: 0,
  ownedFrames: {},
  idolFrameAssignments: {},
  inLevel: false,
  levelJustFinished: false,
  matchedPairs: 0,
  firstPick: null,
  secondPick: null,
  lock: false,
  lockExposure: false,
  startTime: null,
  timerId: null,
  lastLevelTimeSec: null,
  stats: {
    idolMatches: {},
    levelsCompleted: 0,
    bestTimeSec: null,
    levelsUnder30: 0,
    levelsUnder20: 0,
    bestStreak: 0,
    battleWins: 0,
    battleLosses: 0,
    kkumaHits: 0,
    spotlightBestCorrect: 0,
    spotlightBestStreak: 0,
  },
  quests: [],
  pendingNextLevel: false,
  ownedIdols: {},
  ownedAvatars: {},
  equippedAvatarKey: null,
  equippedIdolKey: null,
  ownedProfileBackgrounds: {},
  equippedProfileBackgroundKey: null,
  ownedProfileTitles: {},
  equippedProfileTitleKey: null,
  pendingMainIdolKey: null,
  streak: 0,
  daily: {
    dayKey: null,
    hasDrawn: false,
    wins: 0,           // total minigame levels completed today (max 6)
    claimedCellIndex: null,
    claimedCells: [false, false, false, false, false, false], // L99: 6 boxes
    box: {
      claimed: false,
      opened: false,
      star: 1
    }
  },
  gifts: {
    scoupsForAth: {
      shown: false,
      claimed: false
    }
  },
  idolPower: {},
  levelAbilities: {
    offered: [],
    selected: []
  },
  runtime: {
    offsetSec: 0,
    frozenUntil: 0,
    slowUntil: 0,
    slowRate: 1,
    pausedAccumSec: 0,
    pauseStartMs: 0,
    activeUses: {},
    wonwooCharges: 0,
    wonwooHighlightSec: 0.6,
    wonwooArmed: false,
    hoshiTriesLeft: 0,
    hoshiClicked: false,
    hoshiNextTryTimer: null,
    hoshiAppearsCount: 0,
    hoshiDelayStage: 0,
    vernonProtectStreak: false,
    flipSpeedMult: 2,
    revealAllActive: false,
    revealAllCancelToken: 0,
    abilityInProgress: false,
    mismatchAwaitingFlipBack: false,
  },
  friends: {
    list: [],
    incoming: [],
    outgoing: []
  },
  battles: {
    pendingIncoming: [],
    pendingOutgoing: [],
    active: null,
    logs: [],
    seenLogIds: {}
  },
  news: {
    seenIncomingBattleIds: {}
  },
  rings: 0,
  spotlightLevel: 0,
  spotlightStreak: 0,
  marriedIdols: {},
  love: {},
  giftsInventory: {},
};
// Gifts
const SHOP_GIFTS = [{
  key: 'svt_card_set',
  name: 'SVT Card Set',
  price: 500,
  xp: 10
}, {
  key: 'gose_magazine',
  name: 'GoSe Magazine',
  price: 2400,
  xp: 50
}, {
  key: 'fml_album',
  name: 'FML Album',
  price: 4700,
  xp: 100
}, {
  key: 'bongbongie',
  name: 'Bongbongie',
  price: 12000,
  xp: 250
}, {
  key: 'caratbong',
  name: 'Caratbong',
  price: 45000,
  xp: 1000
}, ];
const AVATAR_RARITIES = [{
  key: '1rare',
  label: 'Rare',
  price: 5000,
  gradient: 'linear-gradient(135deg,#bbf7d0,#6ee7b7)',
  files: []
}, {
  key: '2super_rare',
  label: 'Super Rare',
  price: 10000,
  gradient: 'linear-gradient(135deg,#bfdbfe,#93c5fd)',
  files: []
}, {
  key: '3epic',
  label: 'Epic',
  price: 25000,
  gradient: 'linear-gradient(135deg,#e9d5ff,#c4b5fd)',
  files: []
}, {
  key: '4mythic',
  label: 'Mythic',
  price: 50000,
  gradient: 'linear-gradient(135deg,#fecaca,#f9a8d4)',
  files: []
}, {
  key: '5legendary',
  label: 'Legendary',
  price: 100000,
  gradient: 'linear-gradient(135deg,#fef08a,#fde68a)',
  files: []
}, {
  key: '6ultra_legendary',
  label: 'Ultra Legendary',
  price: 500000,
  gradient: 'linear-gradient(135deg,var(--theme1),var(--theme2))',
  files: []
}, ];
// ── Profile Cards & Titles catalogs (Shop) ──
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
