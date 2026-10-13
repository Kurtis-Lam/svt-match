# Game v2 — what changed

## Structure
`public/gameplay/game.html` is now markup only (720 KB → ~87 KB). CSS and JS moved to cacheable files:

| File | Contents |
|---|---|
| `css/game.css`, `css/season.css` | all styles |
| `js/01-firebase … 16-extras` | the original script, split **in its original order** (nothing rewritten) |
| `js/17-polish.js` | the old `svt-polish` script |
| `js/18-meta-data.js` | **tuning table**: tiers, SP, XP, goals, bonuses |
| `js/19-meta-core.js` | Mastery + Season logic, the single `Meta.onRunComplete()` pipeline |
| `js/20-meta-ui.js` | Season screen + hub card |

Scripts are classic (non-module) and share one global scope, so every inline `onclick="…"` keeps working.
After editing any css/js file run `node tools/stamp.mjs` to bump the cache-busting hashes.
`patch.py` targeted the old single file and no longer applies.

## New loop
Run any game → Season Points + Idol XP + (Fandom) coin bonus → Season tiers, weekly goals, ladder.
Save data: one additive key, `playerState.meta`. Old saves load unchanged; idol Mastery is seeded from lifetime `stats.idolMatches`.
