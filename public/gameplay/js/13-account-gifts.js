// File: public/gameplay/js/13-account-gifts.js
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
  return `
    <div class="glass-card rounded-2xl p-5 text-center">
      <div style="font-size:48px;line-height:1.1">💎</div>
      <p class="text-lg font-black text-gray-900 mt-2">Starter Diamond Pack</p>
      <p class="text-sm text-gray-500 mt-1">A welcome bonus for the premium shop</p>
      <div class="mt-3 rounded-2xl py-3" style="background:linear-gradient(135deg,#ede9fe,#dbeafe)">
        <p class="text-2xl font-black" style="color:#6d28d9">+5 💎</p>
        <p class="text-xs font-bold text-gray-600 mt-1">Idols must be purchased with diamonds</p>
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
  if (GAME_STATE.gifts.scoupsForAth.claimed) return;
  GAME_STATE.diamonds = Math.max(0, Number(GAME_STATE.diamonds) || 0) + 5;
  GAME_STATE.gifts.scoupsForAth.claimed = true;
  GAME_STATE.gifts.scoupsForAth.shown = true;
  renderHub();
  renderIdols();
  renderAvatars();
  await savePlayerState();
  closeGiftOverlayScoups();
  showToast('Gift claimed: +5 diamonds!', 'success');
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
const SHOP_RING_PRICE = Number(GAME_CONFIG.shop.ringPrice || 100000);
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
  // Rings and gifts are rendered together in one box by updateOwnedGiftsSummary()
  updateOwnedGiftsSummary();
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
  const cell = (img, name, count) => `
      <div class="owned-gift-item flex items-center gap-2 min-w-0" style="min-width:0;background:rgba(255,255,255,0.7);border-radius:12px;padding:6px 8px;">
        ${makeOwnedGiftThumbHTML(img)}
        <div class="owned-gift-text text-xs font-semibold text-gray-900 leading-tight truncate" style="min-width:0;flex:1;">${name}</div>
        <span class="count font-extrabold text-sm text-gray-900">${count}</span>
      </div>`;
  const ringCell = cell(SHOP_ITEM_IMAGES.ring || './imgs/assets/shop_ring.png', 'Ring', GAME_STATE.rings || 0);
  const giftCells = SHOP_GIFTS.map(g => cell(getGiftImagePath(g), g.name, GAME_STATE.giftsInventory[g.key] || 0)).join('');
  el.innerHTML = `<div class="owned-gifts-grid grid grid-cols-2 gap-2">${ringCell}${giftCells}</div>`;
}

let __shopPurchaseQty = 1;
let __shopPurchasePrice = 0;
let __shopPurchaseCurrency = 'coins';
function shopQuantityMarkup(price, currency = 'coins') {
  __shopPurchaseQty = 1;
  __shopPurchasePrice = Number(price) || 0;
  __shopPurchaseCurrency = currency;
  const unit = currency === 'diamonds' ? '💎' : '<img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">';
  return `<div class="shop-quantity-control"><button type="button" onclick="adjustShopPurchaseQty(-1)" aria-label="Decrease quantity">−</button><input id="shopPurchaseQuantity" type="number" inputmode="numeric" min="1" max="99" value="1" oninput="syncShopPurchaseQty()" aria-label="Quantity to buy"><button type="button" onclick="adjustShopPurchaseQty(1)" aria-label="Increase quantity">+</button></div><div class="shop-purchase-total">Total: <b id="shopPurchaseTotal">${(Number(price) || 0).toLocaleString()} ${unit}</b></div>`;
}
function readShopPurchaseQty() {
  const input = document.getElementById('shopPurchaseQuantity');
  const qty = Math.max(1, Math.min(99, Math.floor(Number(input?.value) || 1)));
  if (input) input.value = String(qty);
  return qty;
}
function adjustShopPurchaseQty(delta) {
  const input = document.getElementById('shopPurchaseQuantity');
  if (!input) return;
  input.value = String(Math.max(1, Math.min(99, Math.floor(Number(input.value) || 1) + delta)));
  syncShopPurchaseQty();
}
function syncShopPurchaseQty() {
  const out = document.getElementById('shopPurchaseTotal');
  const qty = readShopPurchaseQty();
  if (!out) return;
  const unit = __shopPurchaseCurrency === 'diamonds' ? '💎' : '<img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">';
  out.innerHTML = `${(__shopPurchasePrice * qty).toLocaleString()} ${unit}`;
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

        ${shopQuantityMarkup(price)}
        <div class="grid grid-cols-2 gap-3 pt-2">
          <button class="btn-confirm-no" onclick="closeModal()">Cancel</button>
          <button class="btn-theme black-text" onclick="purchaseRingDirect(readShopPurchaseQty())">Buy</button>
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

      ${shopQuantityMarkup(g.price)}
      <div class="grid grid-cols-2 gap-3 pt-2">
        <button class="btn-confirm-no" onclick="closeModal()">Cancel</button>
        <button class="btn-theme black-text" onclick="purchaseGiftDirect('${g.key}', readShopPurchaseQty())">Buy</button>
      </div>
    </div>
  `);
}

let __ringPurchaseInProgress = false;
async function purchaseRingDirect(quantity = 1) {
  if (__ringPurchaseInProgress) return;
  __ringPurchaseInProgress = true;
  const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));
  const totalPrice = SHOP_RING_PRICE * qty;
  if (GAME_STATE.coins < totalPrice) {
    showToast(`Not enough coins for ${qty} ring${qty === 1 ? '' : 's'} (${totalPrice.toLocaleString()})`, 'error');
    __ringPurchaseInProgress = false;
    return;
  }
  const before = GAME_STATE.coins;
  GAME_STATE.coins -= totalPrice;
  GAME_STATE.rings = (GAME_STATE.rings || 0) + qty;
  renderHub(); updateRingsOwnedDisplay();
  ['hubCoins', 'gameCoins', 'questsCoins', 'idolsCoins', 'shopCoins'].forEach(id => animateNumber(document.getElementById(id), before, GAME_STATE.coins));
  await savePlayerState();
  showToast(`${qty.toLocaleString()} ring${qty === 1 ? '' : 's'} purchased!`, 'success');
  closeModal();
  __ringPurchaseInProgress = false;
}

let __giftPurchaseInProgress = false;
async function purchaseGiftDirect(giftKey, quantity = 1) {
  if (__giftPurchaseInProgress) return;
  __giftPurchaseInProgress = true;
  const g = SHOP_GIFTS.find(x => x.key === giftKey);
  if (!g) { __giftPurchaseInProgress = false; return; }
  const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));
  const totalPrice = g.price * qty;
  if (GAME_STATE.coins < totalPrice) {
    showToast(`Not enough coins (${totalPrice.toLocaleString()} needed)`, 'error');
    __giftPurchaseInProgress = false;
    return;
  }
  const before = GAME_STATE.coins;
  GAME_STATE.coins -= totalPrice;
  GAME_STATE.giftsInventory[g.key] = (GAME_STATE.giftsInventory[g.key] || 0) + qty;
  renderHub(); updateOwnedGiftsSummary();
  ['hubCoins', 'gameCoins', 'questsCoins', 'idolsCoins', 'shopCoins'].forEach(id => animateNumber(document.getElementById(id), before, GAME_STATE.coins));
  await savePlayerState();
  showToast(`${qty.toLocaleString()} × ${g.name} purchased!`, 'success');
  closeModal();
  __giftPurchaseInProgress = false;
}
// Marriage (UPDATED: allow multiple idols marriage)

function confirmMarryIdol(idolKey) {
  if (!isIdolOwned(idolKey)) {
    showToast('You must own this idol', 'error');
    return;
  }
  if ((GAME_STATE.rings || 0) <= 0) {  // L-05: runtime re-check prevents stale-modal double-spend
    showToast('You need at least one Ring', 'error');
    return;
  }
  if (GAME_STATE.marriedIdols[idolKey]) {
    showToast('Already married to this idol', 'info');
    return;
  }
  const idol = IDOLS.find(i => i.key === idolKey);
  openModal("Confirm Marriage", `
    <div class="glass-card rounded-2xl p-4">
      <p class="text-sm text-gray-700">Marry <b>${escapeHtml(idol?.display || idolKey)}</b>? This will consume <b>1 Ring</b>.</p>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-2">
      <button class="btn-confirm-no" onclick="closeModal()">No</button>
      <button class="btn-confirm-yes" onclick="marryIdol('${idolKey}')">Yes</button>
    </div>
  `);
}

let __marryIdolInProgress = false;  // G-05
async function marryIdol(idolKey) {
  if (__marryIdolInProgress) return;  // G-05: double-tap guard
  __marryIdolInProgress = true;
  closeModal();
  // G-05: re-validate rings & ownership inside the action, not just in the modal
  if ((GAME_STATE.rings || 0) <= 0) {
    showToast('No rings available', 'error');
    __marryIdolInProgress = false;
    return;
  }
  if (!isIdolOwned(idolKey)) {
    showToast('You must own this idol', 'error');
    __marryIdolInProgress = false;
    return;
  }
  if (GAME_STATE.marriedIdols[idolKey]) {
    showToast('Already married to this idol', 'info');
    __marryIdolInProgress = false;
    return;
  }
  // Allow multiple marriages
  GAME_STATE.rings -= 1;
  GAME_STATE.marriedIdols[idolKey] = {
    marriedAt: Date.now()
  };
  if (!GAME_STATE.love[idolKey]) GAME_STATE.love[idolKey] = {
    level: 1,   // BUG-G10: start at 1 to match gifting baseline
    xp: 0
  };
  renderHub();
  renderIdols();
  await savePlayerState();
  showToast('Married! 💍', 'success');
  __marryIdolInProgress = false;  // G-05: release
  openIdolDetailsModal(idolKey);
}
// Send Gift panel (kept as-is; icons are used here, not in Shop)
let __giftPanel = null;

function openSendGiftPanel(idolKey) {
  const options = SHOP_GIFTS.map(g => ({
    ...g,
    owned: GAME_STATE.giftsInventory[g.key] || 0
  })).filter(o => o.owned > 0);
  if (!options.length) {
    openModal('Send Gift', `
      <div class="glass-card rounded-2xl p-4 text-sm text-gray-700">You have no gifts. Buy some in the Shop.</div>
      <div class="grid grid-cols-2 gap-3 pt-2">
        <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900" onclick="openIdolDetailsModal('${idolKey}')">Back</button>
        <button class="btn-theme black-text" onclick="closeModal(); openShop();">Open Shop</button>
      </div>
    `);
    return;
  }
  const rows = options.map(g => {
    const img = getGiftImagePath(g);
    return `
      <button class="glass-card rounded-2xl p-3 w-full flex items-center justify-between"
        onclick="openGiftQuantityModal('${idolKey}','${g.key}')">
        <div class="flex items-center gap-3">
          <div style="width:44px;height:44px;border-radius:12px;overflow:hidden;background:transparent;flex:0 0 44px;">
            <img src="${img}" alt="${g.name}" style="width:100%;height:100%;object-fit:contain;display:block;"/>
          </div>
          <div class="text-left">
            <div class="font-extrabold text-gray-900">${g.name}</div>
            <div class="text-[11px] text-gray-500 font-extrabold">Owned: ${g.owned} • +${g.xp} XP</div>
          </div>
        </div>
        <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
      </button>
    `;
  }).join('');
  openModal('Send Gift', `
    <div class="text-xs text-gray-500 font-bold mb-2">Tap a gift to send it</div>
    <div class="space-y-2">${rows}</div>
    <div class="pt-3">
      <button class="glass-card w-full py-3 rounded-2xl font-extrabold text-gray-900"
        onclick="openIdolDetailsModal('${idolKey}')">← Back</button>
    </div>
  `);
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.onclick = () => openIdolDetailsModal(idolKey);
}

function openGiftQuantityModal(idolKey, giftKey) {
  const g = SHOP_GIFTS.find(x => x.key === giftKey);
  if (!g) return;
  const owned = GAME_STATE.giftsInventory[giftKey] || 0;
  const img = getGiftImagePath(g);
  __giftPanel = {
    idolKey,
    selected: giftKey,
    qty: 1
  };
  const render = () => {
    const q = __giftPanel.qty;
    const xpTotal = g.xp * q;
    document.getElementById('giftQtyDisplay').textContent = String(q);
    document.getElementById('giftQtyMinus').disabled = q <= 1;
    document.getElementById('giftQtyPlus').disabled = q >= owned;
    document.getElementById('giftQtyXp').textContent = `+${xpTotal} Love XP`;
  };
  openModal(g.name, `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <div style="width:120px;height:120px;border-radius:18px;overflow:hidden;background:transparent;">
        <img src="${img}" alt="${g.name}" style="width:100%;height:100%;object-fit:contain;display:block;"/>
      </div>
      <div class="font-extrabold text-gray-900 text-lg">${g.name}</div>
      <div class="text-xs text-gray-500 font-bold" id="giftQtyXp">+${g.xp} Love XP</div>
    </div>
    <div class="glass-card rounded-2xl p-3 flex items-center justify-between gap-3 mt-2">
      <button id="giftQtyMinus" class="glass-card w-10 h-10 rounded-xl font-extrabold text-gray-900 flex items-center justify-center"
        onclick="adjustGiftQty(-1); document.getElementById('giftQtyDisplay').textContent=__giftPanel.qty; document.getElementById('giftQtyXp').textContent='+'+ (__giftPanel.qty * ${g.xp}) +' Love XP';">
        <!-- G-09: use adjustGiftQty() instead of stale-closure inline -->
        <i class="fas fa-minus"></i>
      </button>
      <span id="giftQtyDisplay" class="text-xl font-black text-gray-900">1</span>
      <button id="giftQtyPlus" class="glass-card w-10 h-10 rounded-xl font-extrabold text-gray-900 flex items-center justify-center" ${owned <= 1 ? 'disabled' : ''}
        onclick="adjustGiftQty(1); document.getElementById('giftQtyDisplay').textContent=__giftPanel.qty; document.getElementById('giftQtyXp').textContent='+'+ (__giftPanel.qty * ${g.xp}) +' Love XP';">
        <!-- G-09: use adjustGiftQty() instead of stale-closure inline -->
        <i class="fas fa-plus"></i>
      </button>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-2">
      <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900"
        onclick="openSendGiftPanel('${idolKey}')">← Back</button>
      <button class="btn-theme black-text" onclick="sendGiftsToIdol()">Gift 🎁</button>
    </div>
  `);
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.onclick = () => openSendGiftPanel(idolKey);
}

function selectGiftInPanel(key) {
  __giftPanel.selected = key;
  __giftPanel.qty = 1; // default to 1 on change
  const list = document.getElementById('giftSelectList');
  if (!list) return;
  // Rerender selected highlight
  const buttons = [...list.querySelectorAll('button')];
  buttons.forEach(btn => btn.classList.remove('ring-2', 'ring-blue-500'));
  const visible = SHOP_GIFTS.filter(g => (GAME_STATE.giftsInventory[g.key] || 0) > 0);
  const idx = visible.findIndex(g => g.key === key);
  if (idx >= 0 && buttons[idx]) {
    buttons[idx].classList.add('ring-2', 'ring-blue-500');
  }
  updateGiftQtyDisplay();
}

function adjustGiftQty(delta) {
  const owned = GAME_STATE.giftsInventory[__giftPanel.selected] || 0;
  let next = (__giftPanel.qty || 1) + delta;
  next = Math.max(1, Math.min(owned, next)); // enforce 1..owned
  __giftPanel.qty = next;
  // BUG-G05: refresh button disabled state in openGiftQuantityModal
  const minusBtn = document.getElementById('giftQtyMinus');
  const plusBtn  = document.getElementById('giftQtyPlus');
  if (minusBtn) minusBtn.disabled = next <= 1;
  if (plusBtn)  plusBtn.disabled  = next >= owned;
  updateGiftQtyDisplay();
}

function updateGiftQtyDisplay() {
  const owned = GAME_STATE.giftsInventory[__giftPanel.selected] || 0;
  const qty = Math.max(1, Math.min(owned || 1, __giftPanel.qty || 1));
  __giftPanel.qty = qty;
  const qtyEl = document.getElementById('giftQty');
  if (qtyEl) qtyEl.textContent = String(qty);
  const minusBtn = document.getElementById('giftMinusBtn');
  const plusBtn = document.getElementById('giftPlusBtn');
  if (minusBtn) minusBtn.disabled = qty <= 1;
  if (plusBtn) plusBtn.disabled = qty >= owned;
}

function computeGiftXpSum(giftKey, qty) {
  const g = SHOP_GIFTS.find(x => x.key === giftKey);
  if (!g || qty <= 0) return 0;
  return g.xp * qty;
}

function animateLoveBarSequence(fromLevel, fromXp, toLevel, toXp, targetIdolKey) {
  const lvlEl = document.getElementById('loveLevelVal');
  const barFill = document.getElementById('loveBarFill');
  const barText = document.getElementById('loveBarText');
  if (!lvlEl || !barFill || !barText) return;
  let curL = fromLevel;
  let curXp = fromXp;

  function setBar(level, xp) {
    const need = LOVE_XP_REQ[level] || 100;
    const pct = Math.min(100, Math.round((xp / need) * 100));
    barFill.style.width = pct + '%';
    lvlEl.textContent = String(level);
    barText.textContent = `${Math.min(Math.max(0, xp), need)} / ${need}`;  // U-03 FIX: double-clamp
  }
  setBar(curL, curXp);
  const steps = [];
  if (toLevel === fromLevel) {
    // L-01 FIX: animate from fromXp to toXp within same level
    const _need = LOVE_XP_REQ[fromLevel] || 100;
    const _steps = 6;
    for (let _i = 1; _i <= _steps; _i++) {
      steps.push({ level: fromLevel, xp: Math.round(fromXp + (toXp - fromXp) * (_i / _steps)) });
    }
  } else {
    steps.push({
      level: fromLevel,
      xp: LOVE_XP_REQ[fromLevel] || 100
    });
    for (let L = fromLevel + 1; L < toLevel; L++) {
      steps.push({
        level: L,
        xp: LOVE_XP_REQ[L] || 100
      });
    }
    steps.push({
      level: toLevel,
      xp: toXp
    });
  }
  let i = 0;

  function nextStep() {
    if (i >= steps.length) return;
    const s = steps[i++];
    if (s.level > curL) {
      curL = s.level;
      curXp = 0;
      setBar(curL, curXp);
      setTimeout(() => {
        setBar(curL, s.xp);
        setTimeout(nextStep, 700);
      }, 100);
    } else {
      setBar(s.level, s.xp);
      setTimeout(nextStep, 700);
    }
  }
  setTimeout(nextStep, 200);
}

async function sendGiftsToIdol() {
  const idolKey = __giftPanel?.idolKey;
  const giftKey = __giftPanel?.selected;
  const qty = Math.max(1, __giftPanel?.qty || 1);
  if (!idolKey || !giftKey || qty <= 0) {
    showToast('Select at least 1 gift', 'error');
    return;
  }
  const owned = GAME_STATE.giftsInventory[giftKey] || 0;
  if (owned < qty) {
    showToast('Not enough of this gift', 'error');
    return;
  }
  // Record previous love for animation (BUG-G04: use level||0 to match marryIdol init)
  const love = GAME_STATE.love[idolKey] || { level: 0, xp: 0 };
  let fromLevel = love.level || 0;
  let fromXp = love.xp || 0;
  // Apply XP first (inventory decremented after save — G-03)
  let xpAdd = computeGiftXpSum(giftKey, qty);
  let level = love.level || 1;  // XP accumulation starts at 1 even if stored as 0
  let curXp = (love.xp || 0) + xpAdd;
  while (true) {
    const need = LOVE_XP_REQ[level] || 100;
    if (curXp >= need) {
      curXp -= need;
      level += 1;
      if (level > 100) {
        level = 100;
        curXp = 0;
        break;
      }
    } else break;
  }
  GAME_STATE.love[idolKey] = {
    level,
    xp: curXp
  };
  GAME_STATE.giftsInventory[giftKey] = owned - qty;  // G-03: decrement only after successful save
  await savePlayerState();
  showToast(`Gift sent! +${xpAdd} Love XP`, 'success');
  openIdolDetailsModal(idolKey);
  setTimeout(() => {
    animateLoveBarSequence(fromLevel, fromXp, level, curXp, idolKey);
  }, 250);
}

let __accountProfileUpdateInProgress = false;

function showAccountActionLoading(message) {
  let overlay = document.getElementById('accountActionLoadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'accountActionLoadingOverlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(10,14,28,.68);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(100%,300px);padding:28px 24px;border-radius:24px;background:rgba(255,255,255,.97);box-shadow:0 24px 70px rgba(0,0,0,.25);display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;';
    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:42px;height:42px;border:4px solid #e5e7eb;border-top-color:#ec4899;border-radius:50%;animation:accountActionSpin .8s linear infinite;';
    const label = document.createElement('p');
    label.dataset.accountLoadingMessage = 'true';
    label.style.cssText = 'margin:0;color:#111827;font-weight:800;font-size:15px;';
    panel.append(spinner, label);
    overlay.appendChild(panel);
    if (!document.getElementById('accountActionLoadingStyle')) {
      const style = document.createElement('style');
      style.id = 'accountActionLoadingStyle';
      style.textContent = '@keyframes accountActionSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
  }
  const label = overlay.querySelector('[data-account-loading-message]');
  if (label) label.textContent = message || 'Updating your account…';
  overlay.style.display = 'flex';
}

function hideAccountActionLoading() {
  const overlay = document.getElementById('accountActionLoadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

function syncCurrentUserIdentityViews() {
  const username = String(currentUser?.username || '').trim();
  const displayName = String(currentUser?.displayName || '').trim() || username || 'Carat';
  const hubName = document.getElementById('hubUserName');
  if (hubName) hubName.textContent = displayName;
  const settingsName = document.getElementById('settingsUsername');
  if (settingsName) settingsName.textContent = displayName;
  const settingsHandle = document.getElementById('settingsHandle');
  if (settingsHandle) settingsHandle.textContent = 'Logged in as @' + username;
  try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch (e) {}
  try { if (typeof invalidateLeaderboardCache === 'function') invalidateLeaderboardCache(); } catch (e) {}
}

function openChangeDisplayNameModal() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  openModal("Change Display Name", `
    <div id="modalError" class="modal-error" aria-live="polite"></div>
    <div class="space-y-3">
     <div>
      <label class="text-sm text-gray-600 font-medium ml-1">New Display Name</label>
      <div class="relative mt-1">
       <i class="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
       <input type="text" id="newDisplayNameInput" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="Your new display name" maxlength="30" />
      </div>
     </div>
     <div>
      <label class="text-sm text-gray-600 font-medium ml-1">Password (to confirm)</label>
      <div class="relative mt-1">
       <i class="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
       <input type="password" id="displayNamePasswordInput" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="Your password" autocomplete="current-password" />
      </div>
     </div>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-3">
     <button class="glass-card py-4 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Cancel</button>
     <button class="btn-theme black-text" onclick="submitChangeDisplayName()">Save</button>
    </div>
  `);
  setTimeout(() => setModalError(''), 0);
}

async function submitChangeDisplayName() {
  if (__accountProfileUpdateInProgress) return;
  const modalBody = document.getElementById('modalBody');
  // Scope lookups to the visible modal: game.html also contains a hidden legacy input with the same ID.
  const name = (modalBody?.querySelector('#newDisplayNameInput')?.value || '').trim().replace(/\s+/g, ' ');
  const pass = modalBody?.querySelector('#displayNamePasswordInput')?.value || '';
  if (!name || !pass) { setModalError('Fill in all fields.'); return; }
  if (name.length < 2 || name.length > 30) { setModalError('Display name must be 2–30 characters.'); return; }
  if (!/^[\p{L}\p{N}\p{M}\s_\-'.!?]+$/u.test(name)) { setModalError('Display name contains invalid characters.'); return; }
  if (!currentUser?.id || !auth?.currentUser) { setModalError('Your session has expired. Please sign in again.'); return; }

  __accountProfileUpdateInProgress = true;
  showAccountActionLoading('Updating display name…');
  try {
    try {
      const fakeEmail = usernameToEmail(currentUser.username);
      const cred = firebase.auth.EmailAuthProvider.credential(fakeEmail, pass);
      await auth.currentUser.reauthenticateWithCredential(cred);
    } catch (e) {
      setModalError('Incorrect password.');
      return;
    }

    try {
      await db.ref(`users/${currentUser.id}`).update({ displayName: name });
    } catch (e) {
      console.error('[Account] Display-name update failed:', e);
      setModalError((e && e.message) ? `Could not update display name: ${e.message}` : 'Could not update display name. Please try again.');
      return;
    }

    currentUser.displayName = name;
    syncCurrentUserIdentityViews();
    closeModal();
    showToast('Display name changed successfully!', 'success');
  } finally {
    hideAccountActionLoading();
    __accountProfileUpdateInProgress = false;
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } [m]));
}

function computeOfflineCoins(loveLevel, intervals) {
  if (loveLevel < 5 || intervals <= 0) return 0;
  const coinsPerInterval = Math.floor(Math.pow(loveLevel, 1.4) * 51);
  return Math.floor(coinsPerInterval * Math.pow(intervals, 0.75));
}

async function checkOfflineLoveReward() {
  if (!currentUser) return;
  try {
    let lastSeen = null;
    if (db) {
      const snap = await db.ref(`users/${currentUser.id}/analytics/lastSeenAt`).once('value').catch(() => null);
      lastSeen = snap ? snap.val() : null;
    } else {
      lastSeen = Number(localStorage.getItem(`lastSeenAt:${currentUser.username}`) || 0) || null;
    }
    // First visit ever — just stamp the time and return
    if (!lastSeen) {
      if (db) await db.ref(`users/${currentUser.id}/analytics/lastSeenAt`).set(Date.now()).catch(() => {});
      else localStorage.setItem(`lastSeenAt:${currentUser.username}`, String(Date.now()));
      return;
    }
    const elapsed = Date.now() - lastSeen;
    const TICK_MS = 30 * 60 * 1000; // 30-minute tick
    const MAX_TICKS = 48; // cap at 24 h
    if (elapsed < TICK_MS) return;
    const intervals = Math.min(MAX_TICKS, Math.floor(elapsed / TICK_MS));
    const marriedKeys = Object.keys(GAME_STATE.marriedIdols || {}).filter(k => GAME_STATE.marriedIdols[k]);
    if (!marriedKeys.length) return;
    // Build array of {idolKey, loveLevel} then sort descending by love level
    const idolsWithLove = [];
    marriedKeys.forEach(idolKey => {
      const ll = Math.max(1, GAME_STATE.love?.[idolKey]?.level || 1);  // L-03 FIX: guard NaN/undefined
      idolsWithLove.push({
        idolKey,
        loveLevel: ll
      });
    });
    idolsWithLove.sort((a, b) => b.loveLevel - a.loveLevel);
    const top3 = idolsWithLove.slice(0, 3);
    const rewards = [];
    top3.forEach(({
      idolKey,
      loveLevel
    }) => {
      if (loveLevel < 5) return; // love lv < 5 → no passive income
      const coins = computeOfflineCoins(loveLevel, intervals);
      if (coins > 0) rewards.push({
        idolKey,
        loveLevel,
        coins
      });
    });
    if (!rewards.length) return;
    const totalCoins = rewards.reduce((s, r) => s + r.coins, 0);
    showOfflineLoveRewardPopup(rewards, totalCoins);
    // Stamp now so the same period isn't awarded again
    if (db) await db.ref(`users/${currentUser.id}/analytics/lastSeenAt`).set(Date.now()).catch(() => {});
    else localStorage.setItem(`lastSeenAt:${currentUser.username}`, String(Date.now()));
  } catch (e) {
    console.error('checkOfflineLoveReward error', e);
  }
}

function showOfflineLoveRewardPopup(rewards, totalCoins) {
  // Lock entire UI
  const lockEl = document.getElementById('offlineLoveLock');
  lockEl.style.display = 'flex';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      lockEl.style.opacity = '1';
      lockEl.style.backdropFilter = 'blur(10px)';
    });
  });
  // Build idol cards
  const cardsHtml = rewards.map(r => {
    const idol = IDOLS.find(i => i.key === r.idolKey);
    const pair = IDOL_THEME[r.idolKey] || ['#f5c6d0', '#9ec5d9'];
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex:1;min-width:0;">
          <div style="width:88px;height:110px;border-radius:16px;overflow:hidden;border:2px solid rgba(255,255,255,0.7);box-shadow:0 12px 28px rgba(0,0,0,0.18);background:linear-gradient(135deg,${pair[0]},${pair[1]});">
          <img src="./imgs/${r.idolKey}/1.jpg" alt="${idol?.display||r.idolKey}" style="width:100%;height:100%;object-fit:cover;display:block;"/>
          </div>
          <div style="font-weight:900;font-size:12px;color:#0f172a;text-align:center;">${idol?.display||r.idolKey}</div>
          <div style="font-size:11px;font-weight:800;color:#64748b;">Love Lv. ${r.loveLevel}</div>
          <div style="font-weight:900;font-size:15px;color:#b45309;">+${r.coins.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></div>
      </div>
    `;
  }).join('');
  document.getElementById('offlineLoveBody').innerHTML = cardsHtml;
  document.getElementById('offlineLoveTotal').textContent = totalCoins.toLocaleString();
  // Animate popup drop-in
  const popup = document.getElementById('offlineLovePopup');
  popup.style.transform = 'translateY(-40px)';
  popup.style.opacity = '0';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      popup.style.transition = 'transform 0.35s cubic-bezier(0.2,0.8,0.2,1), opacity 0.35s ease';
      popup.style.transform = 'translateY(0)';
      popup.style.opacity = '1';
    });
  });
  // Store total for claim (module-scoped — not accessible from console)
  _offlineLoveTotal = totalCoins;
}

let _offlineLoveTotal = 0;  // BUG-S05: was window.__offlineLoveTotal
let __offlineLoveClaiming = false;  // BUG-G01: double-tap guard
async function claimOfflineLoveReward() {
  if (__offlineLoveClaiming) return;
  __offlineLoveClaiming = true;
  const before = GAME_STATE.coins;
  // The server works out the payout from the time away and your married idols' love levels.
  const res = await claimAwardSafe('offlinelove', {}, true);
  const coins = res ? Number(res.added) || 0 : 0;
  _offlineLoveTotal = 0;
  renderHub();
  animateNumber(document.getElementById('hubCoins'), before, GAME_STATE.coins);
  // Hide overlay
  const lockEl = document.getElementById('offlineLoveLock');
  lockEl.style.opacity = '0';
  lockEl.style.backdropFilter = 'blur(0px)';
  setTimeout(() => {
    lockEl.style.display = 'none';
  }, 400);
  await savePlayerState();
  if (coins > 0) showToast(`Claimed +${coins.toLocaleString()} love coins! 💕`, 'success');
  __offlineLoveClaiming = false;  // BUG-G01: release
}
// Auth flows

// ========== FIXED onLoginSuccess ==========
// ========== UPDATED onLoginSuccess (add the isNew block) ==========
async function onLoginSuccess(isNew = false) {
  // Guard: currentUser must exist
  if (!currentUser) {
    console.warn("onLoginSuccess called without currentUser");
    showToast("Session error – please log in again", "error");
    await handleLogout();
    return;
  }

  // 1) Read abandoned‑battle flag
  const abJson = localStorage.getItem(`abandonedBattle:${currentUser.id}`);
  if (abJson) {
    try {
      GAME_STATE._abandonedBattle = JSON.parse(abJson);
      localStorage.removeItem(`abandonedBattle:${currentUser.id}`);
    } catch (e) {}
  }

  await loadPlayerState();
  ensureGiftStateDefaults();
  ensureDailyResetIfNeeded();
  ensureIdolPowerDefaults();
  ensureFriendsDefaults();
  ensureBattlesDefaults();
  try { Meta.ensure(); Meta.tick(); Meta.syncBattles(); } catch (e) { console.warn('[Meta]', e); }
  // Friends sync + deleted-user cleanup now run in the background (below)
  // so the hub shows as soon as the player's own state is ready.

  // G-01 FIX: de-duplicated isNew initialisation block
  if (isNew) {
    GAME_STATE.level = 0;
    GAME_STATE.spotlightLevel = 0;
    GAME_STATE.snakeventeenLevel = 0;
    GAME_STATE.streak = 0;
    GAME_STATE.spotlightStreak = 0;
    GAME_STATE.snakeventeenStreak = 0;
    GAME_STATE.stats.bestStreak = 0;
    GAME_STATE.stats.spotlightBestCorrect = 0;
    GAME_STATE.stats.spotlightBestStreak = 0;
    GAME_STATE.stats.snakeventeenBestStreak = 0;
    GAME_STATE.stats.snakeventeenLongestLength = 0;
    await savePlayerState(); // persist the zeros
  }

  GAME_STATE.daily.claimedCells = Array.isArray(GAME_STATE.daily.claimedCells)
    ? GAME_STATE.daily.claimedCells.slice(0, 6)
    : [false, false, false, false, false, false];
  while (GAME_STATE.daily.claimedCells.length < 6) GAME_STATE.daily.claimedCells.push(false);
  // Q-01/G-02 FIX: Only initialise box defaults if completely missing — never wipe mid-session state
  if (!GAME_STATE.daily.box || typeof GAME_STATE.daily.box !== 'object') {
    GAME_STATE.daily.box = { claimed: false, opened: false, star: 1 };
  } else {
    // Ensure all required fields exist without overwriting them
    GAME_STATE.daily.box.claimed = GAME_STATE.daily.box.claimed ?? false;
    GAME_STATE.daily.box.opened  = GAME_STATE.daily.box.opened  ?? false;
    GAME_STATE.daily.box.star    = GAME_STATE.daily.box.star    ?? 1;
  }

  ensureAllQuests();
  hydrateQuestProgressFromStats();

  renderHub();
  updateQuestBadges();
  updateNewsBadge();
  renderAvatars();
  updateDailyDrawUI();
  updateDailySixBoxesUI(); // PATCH1: show tick images for already-claimed boxes on login
  if (isNew) await savePlayerState(); else savePlayerState(); // returning users: don't block on the write

  // 2) Handle abandoned battle
  if (GAME_STATE._abandonedBattle) {
    // ... (existing code unchanged)
  }

  startSecondsOnlineTicker();
  startDailyResetWatcher();
  startFriendsMetaRefresh();
  startRealtimeSync(); // ← instant Firebase listeners for admin edits & remote changes

  showToast(isNew ? 'Account created! Ready to play.' : 'Welcome back! Let’s match.');
  // Background: sync friends, drop deleted users, then refresh badges/hub.
  (async () => {
    try {
      await preloadFriendsData();
      await cleanupDeletedUsersFromFriendsAndBattles();
      updateNewsBadge();
      if (!GAME_STATE.inLevel) renderHub();
    } catch (e) { console.warn('background friends sync failed', e); }
  })();
  setTimeout(async () => {
    showScreen('hubScreen');
    maybeAutoOpenDailyWheel();
    maybeShowAthScoupsGiftFirstOpen();
    if (!isNew) {
      await checkOfflineLoveReward();
      const act = GAME_STATE.battles?.active;
      if (act && act.type === 'friend') {
        const game = act.game || 'showtime';
        if (game === 'spotlight') await finalizeSpotlightBattle(0);
        else if (game === 'snakeventeen') await finalizeSnakeBattle(0);
        else await onBattleRunFinished(9999);
        showToast('Previous battle abandoned – recorded as defeat.', 'error');
      } else if (act && act.type === 'friend_reply') {
        const game = act.game || 'showtime';
        if (game === 'spotlight') await finalizeSpotlightBattle(0);
        else if (game === 'snakeventeen') await finalizeSnakeBattle(0);
        else await finalizeFriendReplyBattleIfNeeded(9999);
        showToast('Previous battle reply abandoned – recorded as defeat.', 'error');
      }
    }
  }, 0);
}

function openSettings() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  document.getElementById('settingsUsername').textContent = (currentUser.displayName || '').trim() || currentUser.username || '';
  const handleEl = document.getElementById('settingsHandle');
  if (handleEl) handleEl.textContent = 'Logged in as @' + (currentUser.username || '');
  renderAvatars();
  showScreen('settingsScreen');
}

async function migrateOldIdInFriendsAndBattles(oldId, newId, migratedUser) {
  if (!db || oldId === newId) return;

  try {
    const allSnap = await db.ref('users').once('value');
    const allUsers = allSnap.val() || {};
    const updates = {};

    Object.keys(allUsers).forEach(uid => {
if (uid === oldId || uid === newId) return;
const ps = allUsers[uid]?.playerState || {};
const friends = ps.friends || {};
const battles = ps.battles || {};

// ── Friends list ───────────────────────────────────────────────────
const list = Array.isArray(friends.list) ? [...friends.list] : [];
let listChanged = false;
list.forEach(f => {
  if (f.userId === oldId) { f.userId = newId; listChanged = true; }
});
if (listChanged) updates[`users/${uid}/playerState/friends/list`] = list;

// ── Incoming friend requests ───────────────────────────────────────
const inc = Array.isArray(friends.incoming) ? [...friends.incoming] : [];
let incChanged = false;
inc.forEach(r => {
  if (r.fromUserId === oldId) { r.fromUserId = newId; incChanged = true; }
  if (r.toUserId === oldId)   { r.toUserId   = newId; incChanged = true; }
});
if (incChanged) updates[`users/${uid}/playerState/friends/incoming`] = inc;

// ── Outgoing friend requests ───────────────────────────────────────
const out = Array.isArray(friends.outgoing) ? [...friends.outgoing] : [];
let outChanged = false;
out.forEach(r => {
  if (r.fromUserId === oldId) { r.fromUserId = newId; outChanged = true; }
  if (r.toUserId === oldId)   { r.toUserId   = newId; outChanged = true; }
});
if (outChanged) updates[`users/${uid}/playerState/friends/outgoing`] = out;

// ── Battle incoming ────────────────────────────────────────────────
const bInc = Array.isArray(battles.pendingIncoming)
  ? [...battles.pendingIncoming] : [];
let bIncChanged = false;
bInc.forEach(b => {
  if (b.fromUserId === oldId) { b.fromUserId = newId; bIncChanged = true; }
  if (b.toUserId === oldId)   { b.toUserId   = newId; bIncChanged = true; }
});
if (bIncChanged)
  updates[`users/${uid}/playerState/battles/pendingIncoming`] = bInc;

// ── Battle outgoing ────────────────────────────────────────────────
const bOut = Array.isArray(battles.pendingOutgoing)
  ? [...battles.pendingOutgoing] : [];
let bOutChanged = false;
bOut.forEach(b => {
  if (b.fromUserId === oldId) { b.fromUserId = newId; bOutChanged = true; }
  if (b.toUserId === oldId)   { b.toUserId   = newId; bOutChanged = true; }
});
if (bOutChanged)
  updates[`users/${uid}/playerState/battles/pendingOutgoing`] = bOut;
    });

    if (Object.keys(updates).length) {
await db.ref().update(updates);
    }
  } catch (e) {
    console.error('migrateOldIdInFriendsAndBattles error', e);
  }
}

function openChangeUsernameModal() {
  openModal("Change Username", `
    <div id="modalError" class="modal-error" aria-live="polite"></div>
    <div class="space-y-3">
      <div>
        <label class="text-sm text-gray-600 font-medium ml-1">New Username</label>
        <div class="relative mt-1">
          <i class="fas fa-at absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input type="text" id="newUsernameInput" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="new_username" />
        </div>
        <p class="text-[11px] text-gray-500 font-semibold mt-2">Usernames are unique and lowercase.</p>
      </div>
      <div>
        <label class="text-sm text-gray-600 font-medium ml-1">Password (to confirm)</label>
        <div class="relative mt-1">
          <i class="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input type="password" id="usernamePasswordInput" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="Your password" />
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-3">
      <button class="glass-card py-4 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Cancel</button>
      <button class="btn-theme black-text" onclick="submitChangeUsername()">Change</button>
    </div>
  `);
  setTimeout(() => setModalError(''), 0);
}

async function submitChangeUsername() {
  if (__accountProfileUpdateInProgress) return;
  const modalBody = document.getElementById('modalBody');
  const input = modalBody?.querySelector('#newUsernameInput');
  const newU = normalizeUsername(input?.value || '');
  const pass = modalBody?.querySelector('#usernamePasswordInput')?.value || '';

  if (!newU || !pass) { setModalError('Fill in all fields.'); return; }
  if (newU.length < 3) { setModalError('Username must be at least 3 characters.'); return; }
  if (newU.length > 30) { setModalError('Username must be 30 characters or fewer.'); return; }
  if (newU === normalizeUsername(currentUser?.username)) {
    setModalError('Same as current username.'); return;
  }
  if (!currentUser?.id || !auth?.currentUser) { setModalError('Your session has expired. Please sign in again.'); return; }

  const oldUsername = String(currentUser.username || '');
  const oldDisplayName = String(currentUser.displayName || '').trim();
  const displayNameUsesUsername = !oldDisplayName || normalizeUsername(oldDisplayName) === normalizeUsername(oldUsername);
  __accountProfileUpdateInProgress = true;
  showAccountActionLoading('Updating username…');
  try {
    try {
      const fakeEmail = usernameToEmail(oldUsername);
      const cred = firebase.auth.EmailAuthProvider.credential(fakeEmail, pass);
      await auth.currentUser.reauthenticateWithCredential(cred);
    } catch (e) {
      setModalError('Incorrect password.');
      return;
    }

    try {
      await auth.currentUser.getIdToken(true);
      await svtApi('/api/game/username', { body: { username: newU } });
    } catch (e) {
      setModalError((e && e.message) || 'Could not change username.');
      return;
    }

    // Changing the Firebase Auth email revokes every refresh token for the account, so the
    // session this tab holds is now dead. Sign in again with the new email and the password
    // just confirmed; this keeps the current screen and game state.
    try {
      await auth.signInWithEmailAndPassword(usernameToEmail(newU), pass);
    } catch (e) {
      try { localStorage.removeItem('currentUser'); } catch (e2) {}
      try { await auth.signOut(); } catch (e2) {}
      currentUser = null;
      closeModal();
      showToast('Username changed. Please sign in with your new username.', 'info');
      showScreen('welcomeScreen');
      return;
    }

    currentUser.username = newU;
    if (displayNameUsesUsername) currentUser.displayName = newU;
    syncCurrentUserIdentityViews();
    try { if (typeof savePlayerStateLocal === 'function') savePlayerStateLocal(); } catch (e) {}
    try {
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      if (users[currentUser.id]) {
        users[currentUser.id].username = newU;
        if (displayNameUsesUsername) users[currentUser.id].displayName = newU;
        localStorage.setItem('users', JSON.stringify(users));
      }
      localStorage.removeItem(`playerState:${oldUsername}`);
      localStorage.removeItem(`playerStateOwner:${oldUsername}`);
    } catch (e) {}

    closeModal();
    showToast('Username changed successfully!', 'success');
  } finally {
    hideAccountActionLoading();
    __accountProfileUpdateInProgress = false;
  }
}

function openChangePasswordModal() {
  openModal("Change Password", `
    <div id="modalError" class="modal-error" aria-live="polite"></div>
    <div class="space-y-3">
      <div>
        <label class="text-sm text-gray-600 font-medium ml-1">Current Password</label>
        <div class="relative mt-1">
          <i class="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input type="password" id="oldPasswordInput" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="current password" />
        </div>
      </div>
      <div>
        <label class="text-sm text-gray-600 font-medium ml-1">New Password</label>
        <div class="relative mt-1">
          <i class="fas fa-key absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input type="password" id="newPasswordInput" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="new password (≥ 8 chars)" />
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-3">
      <button class="glass-card py-4 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Cancel</button>
      <button class="btn-theme black-text" onclick="submitChangePassword()">Change</button>
    </div>
  `);
  setTimeout(() => setModalError(''), 0);
}

async function submitChangePassword() {
  const oldP = document.getElementById('oldPasswordInput')?.value || '';
  const newP = document.getElementById('newPasswordInput')?.value || '';

  if (!oldP || !newP) { setModalError('Fill in both fields.'); return; }
  if (newP.length < 8) { setModalError('New password must be at least 8 characters.'); return; } // PATCH G-09

  try {
      // Re-authenticate first (Firebase requires this before password change)
      const fakeEmail = usernameToEmail(currentUser.username);
      const cred = firebase.auth.EmailAuthProvider.credential(fakeEmail, oldP);
      await auth.currentUser.reauthenticateWithCredential(cred);

      // Update password via Firebase Auth only – no DB hash written
      await auth.currentUser.updatePassword(newP);

      // Remove any residual legacy DB hash
      await db.ref(`users/${currentUser.id}/password`).remove().catch(() => {});

      closeModal();
      showToast('Password changed', 'success');
  } catch (error) {
      if (error.code === 'auth/wrong-password') {
      setModalError('Current password is incorrect.');
      } else {
      setModalError('Failed: ' + error.message);
      }
  }
  }

  



document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
  const t = e.target;
  if (!t || t.tagName !== 'INPUT') return;
  const login = document.getElementById('loginScreen');
  const signup = document.getElementById('signupScreen');
  let btn = null;
  if (login && login.contains(t)) btn = document.getElementById('loginBtn');
  else if (signup && signup.contains(t)) btn = document.getElementById('signupBtn');
  if (!btn || btn.disabled) return;
  e.preventDefault();
  btn.click();
});

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    showToast('Please fill in all fields', 'error');
    return;
  }

  setLoading('loginBtn', true);

  try {
    const fakeEmail = usernameToEmail(username);

    const cred = await auth.signInWithEmailAndPassword(fakeEmail, password);
    const uid  = cred.user.uid;

    const snap = await db.ref(`users/${uid}`).once('value');
    const user = snap.val();
    if (!user) {
      showToast('User data not found', 'error');
      setLoading('loginBtn', false);
      return;
    }

    currentUser = { ...user, id: uid };
    delete currentUser.password;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    await onLoginSuccess();

  } catch (error) {
    const friendlyMsg =
      error.code === 'auth/wrong-password'     ? 'Invalid password'    :
      error.code === 'auth/user-not-found'     ? 'User not found'      :
      error.code === 'auth/invalid-credential' ? 'Invalid credentials' :
      error.code === 'auth/too-many-requests'  ? 'Too many attempts – try again later' :
      'Login failed: ' + error.message;
    showToast(friendlyMsg, 'error');
  }

  setLoading('loginBtn', false);
}

function usernameToEmail(username) {
  return `${normalizeUsername(username)}@svtmatch.app`;
}

// ========== UPDATED handleSignup ==========
async function handleSignup() {
  const username = document.getElementById('signupUsername').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  const displayNameInput = document.getElementById('signupDisplayName');
  const name = (displayNameInput?.value || '').trim() || username;

  if (!username || !password) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  // PATCH G-08: enforce username length bounds
  if (username.length < 3) {
    showToast('Username must be at least 3 characters', 'error');
    return;
  }
  if (username.length > 30) {
    showToast('Username must be 30 characters or fewer', 'error');
    return;
  }
  // PATCH G-09: raise password minimum to 8 chars (industry standard)
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }

  setLoading('signupBtn', true);

  try {
    // 1. Check username availability on the server
    const avail = await svtApi('/api/game/username-available?u=' + encodeURIComponent(username), { auth: false });
    if (!avail.valid) {
      showToast(avail.message || 'Invalid username', 'error');
      setLoading('signupBtn', false);
      return;
    }
    if (!avail.available) {
      showToast('Username already taken', 'error');
      setLoading('signupBtn', false);
      return;
    }

    // 2. Create Firebase Auth user
    const fakeEmail = usernameToEmail(username);
    const cred = await auth.createUserWithEmailAndPassword(fakeEmail, password);
    const uid = cred.user.uid;
    try {
      localStorage.removeItem(`playerState:${username.toLowerCase()}`);
      localStorage.removeItem(`playerStateOwner:${username.toLowerCase()}`);
      localStorage.removeItem('currentUser');
    } catch (e) {}
    // hashedPw intentionally not generated – Firebase Auth owns passwords.

    // 3. Store user profile in Realtime DB
    // NOTE: password is managed by Firebase Auth only – not stored in DB.
    let userData;
    try {
      const reg = await svtApi('/api/game/register', { body: { username, displayName: name } });
      userData = reg.user;
    } catch (regErr) {
      try { await cred.user.delete(); } catch (e) {}
      throw regErr;
    }

    // 4. Set currentUser (never cache a password field)
    currentUser = { ...userData, id: uid };
    delete currentUser.password;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    // 5. Reset GAME_STATE – all levels to 0
    GAME_STATE.level = 0;
    GAME_STATE.spotlightLevel = 0;
    GAME_STATE.snakeventeenLevel = 0;
    GAME_STATE.coins = 0;
    GAME_STATE.diamonds = 0;
    GAME_STATE.ownedFrames = {};
    GAME_STATE.idolFrameAssignments = {};
    GAME_STATE.spotlightStreak = 0;
    GAME_STATE.snakeventeenStreak = 0;
    GAME_STATE.stats = {
      idolMatches: {},
      levelsCompleted: 0,
      bestTimeSec: null,
      levelsUnder30: 0,
      levelsUnder20: 0,
      bestStreak: 0,
      spotlightBestCorrect: 0,
      spotlightBestStreak: 0,
      snakeventeenBestStreak: 0,
      snakeventeenLongestLength: 0,
      kkumaHits: 0,
      totalCoinsEarned: 0
    };
    GAME_STATE.quests = [];
    GAME_STATE.pendingNextLevel = false;
    GAME_STATE.ownedIdols = {};
    GAME_STATE.equippedIdolKey = null;
    GAME_STATE.streak = 0;
    GAME_STATE.daily = {
      dayKey: hkDayKey(),
      hasDrawn: false,
      wins: 0,
      claimedCellIndex: null,
      box: { claimed: false, opened: false, star: 1 },
      claimedCells: [false, false, false, false, false, false]
    };
    GAME_STATE.gifts = { scoupsForAth: { shown: false, claimed: false } };
    GAME_STATE.idolPower = {};
    GAME_STATE.friends = { list: [], incoming: [], outgoing: [] };
    GAME_STATE.battles = {
      pendingIncoming: [],
      pendingOutgoing: [],
      active: null,
      logs: [],
      seenLogIds: {}
    };
    GAME_STATE.news = { seenIncomingBattleIds: {} };
    GAME_STATE.rings = 0;
    GAME_STATE.marriedIdols = {};
    GAME_STATE.love = {};
    GAME_STATE.giftsInventory = {};

    ensureAllQuests();
    ensureIdolPowerDefaults();
    await savePlayerState();
    await onLoginSuccess(true);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      showToast('Username already taken', 'error');
    } else {
      showToast('Signup failed: ' + error.message, 'error');
    }
  }
  setLoading('signupBtn', false);
}

async function handleLogout() {
  stopTimer();
  stopSecondsOnlineTicker();
  stopDailyResetWatcher();
  stopFriendsMetaRefresh();
  stopRealtimeSync(); // ← detach all Firebase .on() listeners
  GAME_STATE.inLevel = false;
  
  await auth.signOut();   // ← ADD THIS LINE
  
  localStorage.removeItem('currentUser');
  currentUser = null;
  GAME_STATE.equippedIdolKey = null;
  renderAvatars();
  showToast('Logged out successfully', 'info');
  setTimeout(() => showScreen('welcomeScreen'), 400);
  }

function confirmDeleteAccount() {
  if (!currentUser) return;
  openModal("Delete Account", `
    <div class="glass-card rounded-2xl p-4 space-y-3">
      <p class="text-sm text-gray-700 font-semibold">This will permanently delete your account and all data.</p>
      <p class="text-xs text-gray-500 font-bold">You will be removed from everyone’s friends and battle lists.</p>
      <div>
        <label class="text-sm text-gray-600 font-medium ml-1">Enter your password to confirm</label>
        <div class="relative mt-1">
          <i class="fas fa-key absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input type="password" id="deleteConfirmPassword" class="w-full input-field rounded-xl py-4 pl-12 pr-4" placeholder="Your password" />
        </div>
        <div id="modalError" class="modal-error" aria-live="polite"></div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-2">
      <button class="glass-card py-4 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Cancel</button>
      <button class="btn-theme black-text" onclick="deleteAccountEverywhere()">Confirm Delete</button>
    </div>
  `);
}

function wipeLocalUserData(user) {
  try {
    if (!user) return;
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    if (user.id && users[user.id]) {
      delete users[user.id];
      localStorage.setItem('users', JSON.stringify(users));
    } else {
      const keys = Object.keys(users);
      for (const k of keys) {
        if ((users[k]?.username || '').toLowerCase() === (user.username || '').toLowerCase()) {
          delete users[k];
        }
      }
      localStorage.setItem('users', JSON.stringify(users));
    }
    localStorage.removeItem(`playerState:${user.username}`);
    localStorage.removeItem(`playerStateOwner:${user.username}`);
  } catch (e) {}
}

async function deleteAccountEverywhere() {
  if (!currentUser) return;
  const passInput = document.getElementById('deleteConfirmPassword');
  const pass = passInput ? passInput.value : '';
  const user = auth.currentUser;
  if (!user) {
    setModalError('Please sign in again, then retry.');
    return;
  }

  // Re-authenticate before requesting this sensitive operation.
  try {
    const fakeEmail = usernameToEmail(currentUser.username);
    const cred = firebase.auth.EmailAuthProvider.credential(fakeEmail, pass);
    await user.reauthenticateWithCredential(cred);
    // Ensure the API receives the freshly authenticated ID token.
    await user.getIdToken(true);
  } catch (e) {
    setModalError('Incorrect password.');
    return;
  }

  stopTimer();
  stopSecondsOnlineTicker();
  stopDailyResetWatcher();
  stopFriendsMetaRefresh();
  if (typeof stopRealtimeSync === 'function') stopRealtimeSync();

  try {
    if (!db) {
      // Legacy/offline fallback: there is no database profile to clean up.
      await user.delete();
      wipeLocalUserData(currentUser);
      localStorage.removeItem('currentUser');
      currentUser = null;
      closeModal();
      showToast('Account deleted', 'success');
      showScreen('welcomeScreen');
      return;
    }

    if (typeof window.svtApi !== 'function') {
      throw new Error('Secure account-deletion service is unavailable. Refresh the page and try again.');
    }

    // The server performs the entire cross-user cleanup using Firebase Admin,
    // avoiding stale client snapshots and the normal write gateway restrictions.
    await window.svtApi('/api/game/delete-account', { body: { confirm: true } });

    wipeLocalUserData(currentUser);
    localStorage.removeItem('currentUser');
    try { await auth.signOut(); } catch (e) {}
    closeModal();
    currentUser = null;
    GAME_STATE.equippedIdolKey = null;
    showToast('Account deleted', 'success');
    showScreen('welcomeScreen');
  } catch (e) {
    setModalError('Delete failed: ' + e.message + ' If needed, refresh the page and try again.');
  }
}