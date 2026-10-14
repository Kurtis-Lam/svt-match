# Idol Frames: Add Assets and Configure Prices

1. Add each frame PNG to `public/gameplay/imgs/assets/frames/`. The image should be a transparent PNG with the frame decoration around the outside and a transparent center so the idol image remains visible. Use the same portrait aspect ratio as an idol card.
2. Open `public/gameplay/config.js` and edit `GAME_CONFIG.shop.frames`. Each entry has these fields:
   - `key`: unique machine-safe ID; do not change it after players own the frame.
   - `name`: name shown in the shop.
   - `priceDiamonds`: purchase price in Diamonds (for example, `3` costs 3 Diamonds).
   - `image`: relative path from `public/gameplay/game.html`, normally `./imgs/assets/frames/your_frame.png`.
   - `border`: CSS gradient used for the shop preview border if the PNG is missing.
3. To add a frame, copy an entry and change all five values. Example: `{ key: 'silver_star', name: 'Silver Star', priceDiamonds: 4, image: './imgs/assets/frames/silver_star.png', border: 'linear-gradient(135deg,#e2e8f0,#64748b,#f8fafc)' }`.
4. Run `node tools/stamp.mjs` to refresh asset cache versions, then deploy the site. The code hides a missing frame PNG automatically until you add the matching asset.

Frames are bought with Diamonds. After purchase, open **Shop → Frames → Apply to idol** and choose an owned idol. The overlay is shown around that idol's card in the Idols screen. Frame ownership and assignments are saved with the player state.
