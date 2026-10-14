function checkSession() {
  // PATCH S-05: wrap JSON.parse to handle corrupt localStorage gracefully
  const saved = localStorage.getItem('currentUser');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      return true;
    } catch (e) {
      console.warn('[Security] Corrupt currentUser in localStorage – clearing.', e);
      localStorage.removeItem('currentUser');
    }
  }
  return false;
}

function isAthScoupsGiftEligible() {
  return (currentUser?.username === "ath._.naa");
}

function ensureGiftStateDefaults() {
  if (!GAME_STATE.gifts) GAME_STATE.gifts = {
    scoupsForAth: {
      shown: false,
      claimed: false
    }
  };
  if (!GAME_STATE.gifts.scoupsForAth) GAME_STATE.gifts.scoupsForAth = {
    shown: false,
    claimed: false
  };
  if (typeof GAME_STATE.gifts.scoupsForAth.shown !== "boolean") GAME_STATE.gifts.scoupsForAth.shown = false;
  if (typeof GAME_STATE.gifts.scoupsForAth.claimed !== "boolean") GAME_STATE.gifts.scoupsForAth.claimed = false;
}

function ensureIdolPowerDefaults() {
  GAME_STATE.idolPower ||= {};
  IDOLS.forEach(i => {
    if (GAME_STATE.idolPower[i.key] == null) GAME_STATE.idolPower[i.key] = 1;
  });
}

function buildGiftScoupsCardHtml() {
  const idol = IDOLS.find(i => i.key === "scoups");
  const rarity = IDOL_RARITY["scoups"] || "legendary";
  const imgSrc = `./imgs/scoups/1.jpg`;
  const pair = IDOL_THEME["scoups"] || ["#f5c6d0", "#9ec5d9"];
  const [t1, t2] = pair;
  return `
    <div class="idol-card themed">
      <div class="idol-inner" style="--idolTheme1:${t1}; --idolTheme2:${t2};">
        <div class="idol-panel">
          <img class="idol-thumb" src="${imgSrc}" alt="${idol?.display || 'S.Coups'}" loading="eager" />
          <div class="p-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-bold text-gray-800">${idol?.display || 'S.Coups'}</p>
                <div class="mt-1">
                  <span class="rarity-pill">
                    <span class="rarity-dot" style="background:#facc15"></span>
                    ${rarity}
                  </span>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs text-gray-500">Gift</p>
                <p class="font-bold text-gray-800">1 💎</p>
              </div>
            </div>

            <div class="mt-3">
              <div class="w-full text-center text-xs font-bold text-yellow-700 bg-yellow-50 border border-yellow-100 py-2 rounded-2xl">
                Diamond Gift
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openGiftOverlayScoups() {
  const overlay = document.getElementById('giftOverlay');
  const cardHost = document.getElementById('giftScoupsCard');
  if (!overlay || !cardHost) return;
  cardHost.innerHTML = buildGiftScoupsCardHtml();
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeGiftOverlayScoups() {
  const overlay = document.getElementById('giftOverlay');
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
}

async function claimScoupsGift() {
  if (!currentUser) return;
  ensureGiftStateDefaults();
  ensureIdolPowerDefaults();
  if (GAME_STATE.gifts.scoupsForAth.claimed) return;
  GAME_STATE.diamonds = Math.max(0, Number(GAME_STATE.diamonds || 0)) + 1;
  GAME_STATE.gifts.scoupsForAth.claimed = true;
  GAME_STATE.gifts.scoupsForAth.shown = true;
  renderHub();
  renderIdols();
  renderAvatars();
  await savePlayerState();
  closeGiftOverlayScoups();
  if (typeof refreshShopBalances === 'function') refreshShopBalances();
  showToast("Gift claimed: +1 Diamond! Use Diamonds to unlock idols.", "success");
}

function maybeShowAthScoupsGiftFirstOpen() {
  if (!currentUser) return;
  ensureGiftStateDefaults();
  if (!isAthScoupsGiftEligible()) return;
  if (GAME_STATE.gifts.scoupsForAth.shown) return;
  if (GAME_STATE.gifts.scoupsForAth.claimed) return;
  if (isIdolOwned("scoups")) {
    GAME_STATE.gifts.scoupsForAth.shown = true;
    return;
  }
  GAME_STATE.gifts.scoupsForAth.shown = true;
  savePlayerState();
  setTimeout(() => openGiftOverlayScoups(), 650);
}
/* =========================
   SHOP IMAGE CONFIG (CLEANED)
   Uses transparent PNGs from ./imgs/assets/shop_xxx.png
========================= */
const SHOP_RING_PRICE = 100000;
// Image mapping for shop items (ring + gifts)
const SHOP_ITEM_IMAGES = {
  ring: './imgs/assets/shop_ring.png',
  card: './imgs/assets/shop_card.png',
  magazine: './imgs/assets/shop_magazine.png',
  album: './imgs/assets/shop_album.png',
  bongbongie: './imgs/assets/shop_bongbongie.png',
  lightstick: './imgs/assets/shop_lightstick.png'
};

function getGiftImagePath(gift) {
  return SHOP_ITEM_IMAGES[gift.key] || `./imgs/assets/shop_${gift.key}.png`;
}
// Full-image thumbnail: transparent background, no borders, no icon fallbacks

function makeShopThumbHTML(imgSrc, isModal = false) {
  const size = isModal ? 45 : 50;
  const borderRadius = isModal ? 18 : 16;
  return `
    <div class="shop-thumb-wrap ${isModal ? '' : ''}" style="
      width:${size}px;
      height:${size}px;
      border-radius:${borderRadius}px;
      flex: 0 0 ${size}px;
      overflow:hidden;
      border: none;
      background: transparent;
      display:flex;
      align-items:center;
      justify-content:center;
      box-shadow:none;
      margin: 0;
    ">
      <img
        class="shop-thumb"
        src="${imgSrc}"
        alt="item"
        style="
          width:100%;
          height:100%;
          object-fit: contain;
          object-position: center;
          display:block;
          border-radius:${Math.max(0, borderRadius - 4)}px;
          background: transparent;
        "
        onerror="this.style.display='none';"
      />
    </div>
  `;
}

function makeOwnedGiftThumbHTML(imgSrc) {
  return `
    <div class="owned-gift-thumb-wrap" style="width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:0;background:transparent;border:0;box-shadow:none;">
      <img
        class="owned-gift-thumb"
        src="${imgSrc}"
        alt="gift"
        style="width:100%;height:100%;object-fit:contain;object-position:center;display:block;border-radius:0;background:transparent;border:0;box-shadow:none;"
        onerror="this.style.display='none';"
      />
    </div>
  `;
}

function updateRingsOwnedDisplay() {
  const ringsShop = document.getElementById('ringsCountShop');
  if (!ringsShop) return;
  // Show ring image before "Ring" text + count (transparent PNG)
  ringsShop.innerHTML = `
    <div class="flex items-center gap-2">
      ${makeOwnedGiftThumbHTML(SHOP_ITEM_IMAGES.ring || './imgs/assets/shop_ring.png')}
      <span class="text-sm font-extrabold text-gray-900">Ring: ${GAME_STATE.rings || 0}</span>
    </div>
  `;
}
// Shop rendering

function renderShopItems() {
  const host = document.getElementById('shopItemsHost');
  if (!host) return;
  host.innerHTML = '';
  // Ring row
  const ringPrice = SHOP_RING_PRICE;
  const ringRow = document.createElement('button');
  ringRow.className = 'shop-item-btn';
  ringRow.onclick = () => openShopItemModal('ring', 'ring');
  ringRow.innerHTML = `
    <div class="shop-item-left min-w-0">
      ${makeShopThumbHTML(SHOP_ITEM_IMAGES.ring || './imgs/assets/shop_ring.png')}
      <div class="min-w-0">
        <div class="shop-item-title">Ring</div>
        <div class="shop-item-sub">Required to marry an idol.</div>
      </div>
    </div>
    <div class="shop-item-right shop-item-cost-col">
      <div class="shop-item-cost-label">Price</div>
      <div class="shop-item-cost-val">${ringPrice.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
    </div>
  `;
  host.appendChild(ringRow);
  // Gift rows
  SHOP_GIFTS.forEach(g => {
    const giftPrice = g.price;
    const img = getGiftImagePath(g);
    const row = document.createElement('button');
    row.className = 'shop-item-btn';
    row.onclick = () => openShopItemModal('gift', g.key);
    row.innerHTML = `
      <div class="shop-item-left min-w-0">
        ${makeShopThumbHTML(img)}
        <div class="min-w-0">
          <div class="shop-item-title">${g.name}</div>
          <div class="shop-item-sub">+${g.xp} Love XP</div>
        </div>
      </div>
      <div class="shop-item-right shop-item-cost-col">
        <div class="shop-item-cost-label">Price</div>
        <div class="shop-item-cost-val">${giftPrice.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
      </div>
    `;
    host.appendChild(row);
  });
  updateRingsOwnedDisplay();
  updateOwnedGiftsSummary();
}
// Owned gifts summary (image + two columns, smaller text so it fits)

function updateOwnedGiftsSummary() {
  const el = document.getElementById('ownedGiftsSummary');
  if (!el) return;
  const giftCells = SHOP_GIFTS.map(g => {
    const count = GAME_STATE.giftsInventory[g.key] || 0;
    const img = getGiftImagePath(g);
    return `
      <div class="owned-gift-item flex items-center gap-2 min-w-0" style="min-width:0;">
        ${makeOwnedGiftThumbHTML(img)}
        <div class="owned-gift-text text-xs font-semibold text-gray-900 leading-tight truncate" style="min-width:0;">
          ${g.name}: <span class="count font-extrabold">${count}</span>
        </div>
      </div>
    `;
  }).join('');
  el.innerHTML = `<div class="owned-gifts-grid grid grid-cols-2 gap-2">${giftCells}</div>`;
}

function openShopItemModal(type, key) {
  const modalTitle = 'Confirm purchase?';
  if (type === 'ring') {
    const price = SHOP_RING_PRICE;
    openModal(modalTitle, `
      <div class="space-y-3">
        <div class="glass-card rounded-2xl p-4 shop-modal-item">
          ${makeShopThumbHTML(SHOP_ITEM_IMAGES.ring || './imgs/assets/shop_ring.png')}
          <div>
            <div class="font-extrabold text-gray-900">Ring</div>
            <div class="text-xs text-gray-600 font-bold">Required to marry an idol.</div>
          </div>
          <div class="shop-price-col">
            <div class="shop-item-cost-label">Price</div>
            <div class="shop-item-cost-val">${price.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
          </div>
        </div>
        ${shopQuantityHtml(price, 'coins')}

        <div class="grid grid-cols-2 gap-3 pt-2">
          <button class="btn-confirm-no" onclick="closeModal()">Cancel</button>
          <button class="btn-theme black-text" onclick="purchaseRingDirect()">Buy</button>
        </div>
      </div>
    `);
    return;
  }
  const g = SHOP_GIFTS.find(x => x.key === key);
  if (!g) return;
  const img = getGiftImagePath(g);
  openModal(modalTitle, `
    <div class="space-y-3">
      <div class="glass-card rounded-2xl p-4 shop-modal-item">
        ${makeShopThumbHTML(img)}
        <div>
          <div class="font-extrabold text-gray-900">${g.name}</div>
          <div class="text-[11px] text-gray-600 font-bold mt-1">+${g.xp} Love XP</div>
        </div>
        <div class="shop-price-col">
          <div class="shop-item-cost-label">Price</div>
          <div class="shop-item-cost-val">${g.price.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
        </div>
      </div>
      ${shopQuantityHtml(g.price, 'coins')}

      <div class="grid grid-cols-2 gap-3 pt-2">
        <button class="btn-confirm-no" onclick="closeModal()">Cancel</button>
        <button class="btn-theme black-text" onclick="purchaseGiftDirect('${g.key}')">Buy</button>
      </div>
    </div>
  `);
}

let __ringPurchaseInProgress = false;
async function purchaseRingDirect(quantity = readShopPurchaseQuantity()) {
  if (__ringPurchaseInProgress) return;
  __ringPurchaseInProgress = true;
  try {
    const qty = Math.max(1, Math.min(999, Math.floor(Number(quantity) || 1)));
    const cost = SHOP_RING_PRICE * qty;
    if (GAME_STATE.coins < cost) { showToast(`Not enough coins for ${qty} Ring${qty === 1 ? '' : 's'} (${formatNumber(cost)})`, 'error'); return; }
    const before = GAME_STATE.coins;
    GAME_STATE.coins -= cost;
    GAME_STATE.rings = (GAME_STATE.rings || 0) + qty;
    renderHub(); updateRingsOwnedDisplay();
    ['hubCoins','gameCoins','questsCoins','idolsCoins','shopCoins'].forEach(id => { const el = document.getElementById(id); if (el) animateNumber(el, before, GAME_STATE.coins); });
    await savePlayerState();
    showToast(`${formatNumber(qty)} Ring${qty === 1 ? '' : 's'} purchased!`, 'success');
    closeModal();
  } finally { __ringPurchaseInProgress = false; }
}

let __giftPurchaseInProgress = false;
async function purchaseGiftDirect(giftKey, quantity = readShopPurchaseQuantity()) {
  if (__giftPurchaseInProgress) return;
  __giftPurchaseInProgress = true;
  try {
    const g = SHOP_GIFTS.find(x => x.key === giftKey);
    if (!g) { showToast('Gift not found', 'error'); return; }
    const qty = Math.max(1, Math.min(999, Math.floor(Number(quantity) || 1)));
    const cost = Number(g.price) * qty;
    if (GAME_STATE.coins < cost) { showToast(`Not enough coins. Need ${formatNumber(cost)}.`, 'error'); return; }
    const before = GAME_STATE.coins;
    GAME_STATE.coins -= cost;
    GAME_STATE.giftsInventory[g.key] = (GAME_STATE.giftsInventory[g.key] || 0) + qty;
    renderHub(); updateOwnedGiftsSummary();
    ['hubCoins','gameCoins','questsCoins','idolsCoins','shopCoins'].forEach(id => { const el = document.getElementById(id); if (el) animateNumber(el, before, GAME_STATE.coins); });
    await savePlayerState();
    showToast(`${formatNumber(qty)} × ${g.name} purchased!`, 'success');
    closeModal();
  } finally { __giftPurchaseInProgress = false; }
}
