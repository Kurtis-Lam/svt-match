/* META LOOP — idol mastery and configuration-driven 17-level Brawl Pass. */
const seasonLevels = Array.isArray(GAME_CONFIG.season?.levels) ? GAME_CONFIG.season.levels : [];
let seasonXpTotal = 0;
const seasonTiers = seasonLevels.map((level, index) => {
  if (index > 0) seasonXpTotal += Math.max(0, Number(level.xpRequired) || 0);
  return { sp: seasonXpTotal, name: `Level ${index + 1}`, reward: level.reward || {} };
});
const seasonRules = GAME_CONFIG.season?.sxp || {};
const masteryConfig = GAME_CONFIG.mastery || {};
const META = {
  VERSION: 2,
  SEASON_ANCHOR_DAY: (() => {
    const d = GAME_CONFIG.season?.startsOn || [2026, 10, 12];
    return Math.floor(Date.UTC(Number(d[0]), Number(d[1]) - 1, Number(d[2])) / 86400000);
  })(),
  MASTERY_XP: masteryConfig.levelXp || [0, 60, 150, 280, 450, 680, 960, 1300, 1700, 2200],
  LEGACY_XP_PER_MATCH: masteryConfig.legacyXpPerMatch || 6,
  LEGACY_XP_CAP: masteryConfig.legacyXpCap || 1300,
  XP: masteryConfig.xpPerRun || { leadPass: 20, leadFail: 8, deckPass: 4, deckFail: 2, targetPass: 6 },
  LEVELUP_COINS_PER_LEVEL: masteryConfig.levelUpCoinsPerLevel || 100,
  COIN_BONUS_PER_FP: masteryConfig.fandomCoinBonusPerPower ?? 0.005,
  COIN_BONUS_CAP: masteryConfig.fandomCoinBonusCap ?? 0.25,
  SP: {
    pass: Number(seasonRules.levelPassed) || 10,
    fail: Number(seasonRules.levelFailed) || 3,
    elite: Number(seasonRules.streakMaintained) || 5,
    leadBonusEvery: Number(seasonRules.leadBonusEveryMasteryLevels) || 4,
    fullRunsPerDay: Number(seasonRules.fullValueRunsPerDay) || 12,
    overflow: Number(seasonRules.overflowPerRun) || 1,
    win: Number(seasonRules.battleWin) || 40,
    tie: Number(seasonRules.battleTie) || 20,
    loss: Number(seasonRules.battleLoss) || 15,
  },
  TIERS: seasonTiers.length ? seasonTiers : [{ sp: 0, name: 'Level 1', reward: { coins: 100 } }],
  GOALS: (GAME_CONFIG.season?.goals || []).map(goal => ({
    id: goal.id, label: goal.label, target: Number(goal.target) || 1, sp: Number(goal.sxp ?? goal.xp) || 0,
  })),
  GAME_LABEL: { showtime: 'Showtime', spotlight: 'Spotlight', snakeventeen: 'Snakeventeen', echo: 'Choreo Echo' },
};
