function openShopAvatars(fromSettings = false) {
  if (!fromSettings) _shopPreviousPage = 'landing';
  document.getElementById('avatarsCoins').textContent = Number(GAME_STATE.coins || 0).toLocaleString();
  const diamonds = document.getElementById('avatarsDiamonds'); if (diamonds) diamonds.textContent = Number(GAME_STATE.diamonds || 0).toLocaleString();
  const backBtn = document.getElementById('avatarsBackBtn');
  backBtn.style.display = '';
  backBtn.onclick = () => {
    if (fromSettings) {
      showScreen('settingsScreen');
    } else {
      _shopPreviousPage = 'hub';
      renderShopLanding();
      showScreen('shopScreen');
    }
  };
  renderAvatarsScreen('comingSoon'); // # CHANGE: renderAvatarsScreen('comingSoon');
  showScreen('avatarsScreen');
}

function renderAvatarsScreen(phase, rarityKey) {
  const body = document.getElementById('avatarsBody');
  // CHANGE: delete phase === comingSoon
  if (phase === 'comingSoon') {
    body.innerHTML = `
      <div style="
        display:flex; align-items:center; justify-content:center;
        height:100%; padding:20px;
        background:linear-gradient(135deg, var(--theme1), var(--theme2));
        border-radius:22px; margin:16px; box-shadow:0 12px 30px rgba(0,0,0,0.1);
        border:1px solid rgba(255,255,255,0.5);
      ">
        <div style="
          background:rgba(255,255,255,0.85);
          padding:24px 32px; border-radius:20px;
          border:1px solid rgba(255,255,255,0.9);
          box-shadow:0 8px 24px rgba(0,0,0,0.1);
          text-align:center;
        ">
          <p style="font-size:28px; font-weight:900; color:#0f172a; margin:0;">
            Coming Soon!
          </p>
          <p style="font-size:14px; color:#475569; margin-top:8px; font-weight:700;">
            Custom avatars will be available here.
          </p>
        </div>
      </div>
    `;
    return;
  }
  if (phase === 'raritySelect') {
    body.innerHTML = `<div class="space-y-3 mt-2">` + AVATAR_RARITIES.map(r => `
      <button onclick="renderAvatarsScreen('list','${r.key}')"
        style="width:100%;padding:18px 20px;border-radius:20px;background:${r.gradient};
               font-weight:900;font-size:16px;color:#0f172a;border:1px solid rgba(255,255,255,0.6);
               box-shadow:0 12px 28px rgba(0,0,0,0.10);text-align:left;
               display:flex;align-items:center;justify-content:space-between;">
        <span>${r.label}</span>
        <span style="font-size:13px;opacity:0.75;display:flex;align-items:center;gap:3px;">${r.price.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></span>
      </button>
    `).join('') + `</div>`;
    return;
  }
  if (phase === 'list') {
    const rarity = AVATAR_RARITIES.find(r => r.key === rarityKey);
    if (!rarity) return;
    body.innerHTML = `

      <p style="font-weight:900;font-size:15px;color:#0f172a;margin-bottom:10px;">${rarity.label} Avatars</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;" id="avatarGrid">
      </div>
    `;
    const grid = document.getElementById('avatarGrid');
    if (!rarity.files.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;color:#64748b;font-weight:700;font-size:13px;">No avatars in this tier yet.</div>`;
      return;
    }
    rarity.files.forEach(filename => {
      const fullKey = `${rarityKey}/${filename}`;
      const owned = !!(GAME_STATE.ownedAvatars || {})[fullKey];
      const equipped = GAME_STATE.equippedAvatarKey === fullKey;
      const label = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const card = document.createElement('button');
      card.style.cssText = `
        border-radius:16px;padding:8px;
        background:rgba(255,255,255,0.9);border:${equipped?'3px solid #3b82f6':'2px solid rgba(0,0,0,0.06)'};
        box-shadow:0 8px 20px rgba(0,0,0,0.1);display:flex;flex-direction:column;
        align-items:center;gap:6px;
      `;
      card.innerHTML = `
        <img src="./imgs/assets/avatars/${fullKey}" alt="${label}"
          style="width:100%;aspect-ratio:1;border-radius:12px;object-fit:cover;border:2px solid rgba(255,255,255,0.6);"
          onerror="this.src='${'./imgs/assets/default_avatar.png'}'"/>
        <div style="font-size:10px;font-weight:800;color:#0f172a;text-align:center;line-height:1.1;">${label}</div>
        <div style="font-size:9px;font-weight:900;color:${equipped?'#1d4ed8':owned?'#16a34a':'#64748b'};">
          ${equipped ? '✓ Selected' : owned ? 'Owned' : rarity.price.toLocaleString()+' <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">'}
        </div>
      `;
      card.onclick = () => {
        if (owned || equipped) {
          // Toggle equip
          GAME_STATE.equippedAvatarKey = equipped ? null : fullKey;
          renderAvatars();
          savePlayerState();
          renderAvatarsScreen('list', rarityKey);
          showToast(equipped ? 'Avatar unequipped' : 'Avatar equipped!', 'success');
        } else {
          confirmAvatarPurchase(fullKey, label, rarity);
        }
      };
      grid.appendChild(card);
    });
  }
}

function confirmAvatarPurchase(fullKey, label, rarity) {
  openModal('Buy Avatar?', `
    <div class="glass-card rounded-2xl p-4 text-center">
      <img src="./imgs/assets/avatars/${fullKey}" alt="${label}"
        style="width:100px;height:100px;border-radius:18px;object-fit:cover;margin:0 auto 10px;display:block;border:2px solid rgba(0,0,0,0.08);"
        onerror="this.src='${'./imgs/assets/default_avatar.png'}'"/>
      <p style="font-weight:900;color:#0f172a;">${label}</p>
      <p style="font-size:12px;color:#64748b;font-weight:700;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:4px;">${rarity.price.toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></p>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-2">
      <button class="btn-confirm-no" onclick="closeModal()">Cancel</button>
      <button class="btn-confirm-yes" onclick="purchaseAvatar('${fullKey}','${rarity.key}',${rarity.price})">Confirm</button>
    </div>
  `);
}

let __avatarPurchaseInProgress = false;
async function purchaseAvatar(fullKey, rarityKey, price) {
  // PATCH G-07: guard against double-tap double-deduct
  if (__avatarPurchaseInProgress) return;
  __avatarPurchaseInProgress = true;
  closeModal();
  if (GAME_STATE.coins < price) {
    showToast('Not enough coins', 'error');
    __avatarPurchaseInProgress = false;
    return;
  }
  if (GAME_STATE.ownedAvatars && GAME_STATE.ownedAvatars[fullKey]) {
    showToast('Avatar already owned', 'info');
    __avatarPurchaseInProgress = false;
    return;
  }
  GAME_STATE.coins -= price;
  GAME_STATE.ownedAvatars = GAME_STATE.ownedAvatars || {};
  GAME_STATE.ownedAvatars[fullKey] = true;
  GAME_STATE.equippedAvatarKey = fullKey;
  renderAvatars();
  renderHub();
  document.getElementById('avatarsCoins').textContent = Number(GAME_STATE.coins || 0).toLocaleString();
  const diamonds = document.getElementById('avatarsDiamonds'); if (diamonds) diamonds.textContent = Number(GAME_STATE.diamonds || 0).toLocaleString();
  await savePlayerState();
  __avatarPurchaseInProgress = false;
  showToast('Avatar purchased & equipped!', 'success');
  renderAvatarsScreen('list', rarityKey);
}

function openIdols() {
  renderHub();
  renderIdols();
  showScreen('idolsScreen');
}

function openShop() {
  renderHub();
  renderShopLanding();
  showScreen('shopScreen');
}
let _shopPreviousPage = 'hub';

function handleShopBack() {
  if (_shopPreviousPage === 'landing') {
    _shopPreviousPage = 'hub';
    renderShopLanding();
  } else {
    showScreen('hubScreen');
  }
}

function renderShopLanding() {
  _shopPreviousPage = 'hub';
  const area = document.getElementById('shopScrollArea');
  area.innerHTML = `
    <div class="mt-4 space-y-3">
    <button class="hub-action-card rounded-2xl p-5 flex items-center gap-4 w-full"
        onclick="openShopIdolGifts()">
        <div class="hub-action-icon-wrap" style="background:linear-gradient(135deg,var(--theme1),var(--theme2));overflow:hidden;">
        <img alt="Idol Gifts" class="hub-action-icon" src="./imgs/assets/shop_idolgifts.png" style="object-fit:contain;"/>
        </div>
        <div class="text-left min-w-0">
        <p class="font-bold text-gray-800">Idol Gifts</p>
        <p class="text-xs text-gray-500">Gifts, rings &amp; more</p>
        </div>
        <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
    </button>

    <button class="hub-action-card rounded-2xl p-5 flex items-center gap-4 w-full"
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

    <button class="hub-action-card rounded-2xl p-5 flex items-center gap-4 w-full" onclick="openShopDiamonds()">
        <div class="hub-action-icon-wrap" style="background:linear-gradient(135deg,#8b5cf6,#38bdf8);"><span style="font-size:26px">💎</span></div>
        <div class="text-left min-w-0"><p class="font-bold text-gray-800">Diamonds</p><p class="text-xs text-gray-500">Buy premium currency · ${Number(GAME_CONFIG.shop.diamondPriceCoins || 1000).toLocaleString()} coins each</p></div>
        <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
    </button>

    <button class="hub-action-card rounded-2xl p-5 flex items-center gap-4 w-full" onclick="openShopFrames()">
        <div class="hub-action-icon-wrap" style="background:linear-gradient(135deg,#fb7185,#fbbf24);"><span style="font-size:26px">🖼️</span></div>
        <div class="text-left min-w-0"><p class="font-bold text-gray-800">Frames</p><p class="text-xs text-gray-500">Decorate your idol cards with diamond frames</p></div>
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

function openShopDiamonds() {
  _shopPreviousPage = 'landing';
  const area = document.getElementById('shopScrollArea');
  const price = Number(GAME_CONFIG.shop.diamondPriceCoins || 1000);
  area.innerHTML = `<div class="glass-card rounded-2xl p-4 shop-currency-page">
    <div class="flex items-center justify-between"><div><p class="text-lg font-black text-gray-900">💎 Diamonds</p><p class="text-xs text-gray-500 font-bold">Premium currency for idols and frames</p></div><div class="shop-diamond-balance">Balance: <b>${Number(GAME_STATE.diamonds || 0).toLocaleString()} 💎</b></div></div>
    <div class="glass-card rounded-2xl p-4 mt-4"><div class="text-center"><div style="font-size:44px">💎</div><b class="text-gray-900">1 diamond</b><p class="text-sm text-gray-500 mt-1">${price.toLocaleString()} coins each</p><p class="text-xs text-gray-500 mt-1">Diamond pricing is intentionally expensive. Idol prices use the separate 500-coin conversion configured in config.js.</p></div>
      <div class="shop-quantity-control"><button type="button" onclick="adjustDiamondQuantity(-1)" aria-label="Remove diamond">−</button><input id="diamondQuantity" inputmode="numeric" type="number" min="1" max="100000" value="1" oninput="syncDiamondPurchaseQuote()" aria-label="Quantity to buy"/><button type="button" onclick="adjustDiamondQuantity(1)" aria-label="Add diamond">+</button></div>
      <div class="shop-purchase-total">Total: <b id="diamondPurchaseTotal">${price.toLocaleString()} coins</b></div>
      <button class="btn-theme black-text w-full mt-3" onclick="buyDiamonds()">Buy Diamonds</button>
    </div></div>`;
  syncDiamondPurchaseQuote();
}

function readDiamondQuantity() {
  const input = document.getElementById('diamondQuantity');
  const qty = Math.max(1, Math.min(100000, Math.floor(Number(input?.value) || 1)));
  if (input) input.value = String(qty);
  return qty;
}
function adjustDiamondQuantity(delta) {
  const input = document.getElementById('diamondQuantity');
  if (!input) return;
  input.value = String(Math.max(1, Math.min(100000, Math.floor(Number(input.value) || 1) + delta)));
  syncDiamondPurchaseQuote();
}
function syncDiamondPurchaseQuote() {
  const total = document.getElementById('diamondPurchaseTotal');
  const qty = readDiamondQuantity();
  if (total) total.textContent = (qty * Number(GAME_CONFIG.shop.diamondPriceCoins || 1000)).toLocaleString() + ' coins';
}
async function buyDiamonds() {
  if (!currentUser) { showToast('Not logged in', 'error'); return; }
  const qty = readDiamondQuantity();
  const cost = qty * Number(GAME_CONFIG.shop.diamondPriceCoins || 1000);
  if (GAME_STATE.coins < cost) { showToast(`Not enough coins. Need ${cost.toLocaleString()} coins`, 'error'); return; }
  const before = GAME_STATE.coins;
  GAME_STATE.coins -= cost;
  GAME_STATE.diamonds = Math.max(0, Number(GAME_STATE.diamonds) || 0) + qty;
  renderHub();
  renderIdols();
  ['hubCoins', 'gameCoins', 'questsCoins', 'idolsCoins', 'shopCoins'].forEach(id => animateNumber(document.getElementById(id), before, GAME_STATE.coins));
  await savePlayerState();
  showToast(`Bought ${qty.toLocaleString()} diamond${qty === 1 ? '' : 's'} for ${cost.toLocaleString()} coins`, 'success');
  openShopDiamonds();
}

function openShopFrames() {
  _shopPreviousPage = 'landing';
  const area = document.getElementById('shopScrollArea');
  const frames = Array.isArray(GAME_CONFIG.shop.frames) ? GAME_CONFIG.shop.frames : [];
  const ownedIdols = IDOLS.filter(idol => isIdolOwned(idol.key));
  const instructions = `<div class="ss-card"><b>Adding your own frames</b><p class="mt-2 text-sm">Put each transparent PNG in <code>public/gameplay/imgs/assets/frames/</code>, then add an entry to <code>GAME_CONFIG.shop.frames</code> in <code>public/gameplay/config.js</code> with <code>key</code>, <code>name</code>, <code>priceDiamonds</code>, <code>image</code>, and optional CSS <code>border</code>. Example: <code>{ key: 'rose', name: 'Rose Frame', priceDiamonds: 4, image: './imgs/assets/frames/rose.png', border: 'linear-gradient(135deg,#fb7185,#fbbf24)' }</code>. Run <code>node tools/stamp.mjs</code> after changing config or assets.</p></div>`;
  area.innerHTML = `<div class="space-y-3"><div class="glass-card rounded-2xl p-4"><div class="flex items-center justify-between"><div><p class="text-lg font-black text-gray-900">Idol Frames</p><p class="text-xs text-gray-500 font-bold">Buy with diamonds and apply to any owned idol card</p></div><b>💎 ${Number(GAME_STATE.diamonds || 0).toLocaleString()}</b></div></div>
  ${frames.length ? frames.map(frame => {
    const own = !!GAME_STATE.ownedFrames?.[frame.key];
    const assigned = IDOLS.find(i => GAME_STATE.idolFrameAssignments?.[i.key] === frame.key)?.key || '';
    const preview = frame.image ? `<img class="shop-frame-preview-img" src="${escapeHtml(frame.image)}" alt="${escapeHtml(frame.name)}" onerror="this.style.display='none'"/>` : '';
    const fallback = `<span class="shop-frame-preview-fallback" style="--frame-border:${String(frame.border || 'linear-gradient(135deg,#fbbf24,#c084fc)')}"></span>`;
    const options = ownedIdols.map(idol => `<option value="${idol.key}" ${assigned === idol.key ? 'selected' : ''}>${escapeHtml(idol.display)}</option>`).join('');
    return `<div class="glass-card rounded-2xl p-4 shop-frame-card"><div class="shop-frame-preview">${fallback}${preview}</div><div class="shop-frame-info"><b>${escapeHtml(frame.name || frame.key)}</b><div class="text-xs text-gray-500 mt-1">${own ? 'Owned' : `${Number(frame.priceDiamonds || 0).toLocaleString()} 💎`}</div>${own ? `<div class="shop-frame-apply"><select id="frameTarget_${escapeHtml(frame.key)}"><option value="none">Remove from all idols</option>${options}</select><button class="btn-soft-sm" onclick="applyFrameToIdol('${escapeHtml(frame.key)}')">Apply</button></div>` : `<button class="btn-theme black-text mt-2" onclick="buyIdolFrame('${escapeHtml(frame.key)}')">Buy for ${Number(frame.priceDiamonds || 0).toLocaleString()} 💎</button>`}</div></div>`;
  }).join('') : `<div class="glass-card rounded-2xl p-4 text-center"><div style="font-size:36px">🖼️</div><b class="text-gray-900">No frames configured yet</b><p class="text-sm text-gray-500 mt-2">Add your frame art later using the setup guide below. Frame prices are configured in diamonds.</p></div>`}
  ${instructions}</div>`;
}

async function buyIdolFrame(frameKey) {
  const frame = (GAME_CONFIG.shop.frames || []).find(f => f.key === frameKey);
  if (!frame || GAME_STATE.ownedFrames?.[frameKey]) { showToast('Frame is unavailable or already owned', 'info'); return; }
  const cost = Math.max(0, Math.floor(Number(frame.priceDiamonds) || 0));
  if (GAME_STATE.diamonds < cost) { showToast(`Not enough diamonds. Need ${cost.toLocaleString()} 💎`, 'error'); return; }
  GAME_STATE.diamonds -= cost;
  GAME_STATE.ownedFrames ||= {};
  GAME_STATE.ownedFrames[frameKey] = true;
  await savePlayerState();
  renderHub();
  showToast(`${frame.name || frameKey} frame purchased`, 'success');
  openShopFrames();
}

async function applyFrameToIdol(frameKey) {
  if (!GAME_STATE.ownedFrames?.[frameKey]) { showToast('Buy this frame first', 'error'); return; }
  const select = document.getElementById(`frameTarget_${frameKey}`);
  const idolKey = select?.value || 'none';
  GAME_STATE.idolFrameAssignments ||= {};
  if (idolKey === 'none') {
    Object.keys(GAME_STATE.idolFrameAssignments).forEach(key => { if (GAME_STATE.idolFrameAssignments[key] === frameKey) delete GAME_STATE.idolFrameAssignments[key]; });
  } else if (isIdolOwned(idolKey)) {
    Object.keys(GAME_STATE.idolFrameAssignments).forEach(key => { if (GAME_STATE.idolFrameAssignments[key] === frameKey && key !== idolKey) delete GAME_STATE.idolFrameAssignments[key]; });
    GAME_STATE.idolFrameAssignments[idolKey] = frameKey;
  } else { showToast('You must own that idol first', 'error'); return; }
  await savePlayerState();
  renderIdols();
  showToast(idolKey === 'none' ? 'Frame removed' : 'Frame applied to idol card', 'success');
  openShopFrames();
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
        <span style="margin-left:10px;">💎 <span id="profileShopDiamonds">${Number(GAME_STATE.diamonds || 0).toLocaleString()}</span></span>
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
}

function openShopIdolGifts() {
  _shopPreviousPage = 'landing';
  const area = document.getElementById('shopScrollArea');
  area.innerHTML = `
    <div class="glass-card rounded-2xl p-4">
    <div class="text-sm font-extrabold text-gray-900">Items</div>
    <div class="mt-3 space-y-2" id="shopItemsHost"></div>
    </div>
    <div class="mt-3 glass-card rounded-2xl px-3 py-2 text-sm font-extrabold text-gray-900">
    <div class="flex items-center justify-between gap-2 w-full" id="ringsCountShop"></div>
    </div>
    <div class="mt-2 glass-card rounded-2xl px-3 py-2 text-sm font-extrabold text-gray-900">
    <div>Owned Gifts</div>
    <div class="mt-1 whitespace-pre-line" id="ownedGiftsSummary">—</div>
    </div>
  `;
  renderShopItems();
}

function rarityDotColor(rarity) {
  const map = {
    legendary: "#facc15",
    mythic: "#ef4444",
    epic: "#a855f7",
    superrare: "#3b82f6",
    rare: "#22c55e"
  };
  return map[rarity] || "#94a3b8";
}

function loveLevel(idolKey) {
  return Number(GAME_STATE.love?.[idolKey]?.level || 0);  // I-03 FIX: safe — always returns number
}

function idolsSortedByCurrentMode() {
  const base = [...IDOLS];
  if (IDOL_SORT_MODE === "name") {
    base.sort((a, b) => a.display.localeCompare(b.display));
  } else if (IDOL_SORT_MODE === "power") {
    base.sort((a, b) => getIdolPower(b.key) - getIdolPower(a.key) || a.display.localeCompare(b.display));
  } else if (IDOL_SORT_MODE === "matches") {
    base.sort((a, b) => idolMatchCount(b.key) - idolMatchCount(a.key) || a.display.localeCompare(b.display));
  } else if (IDOL_SORT_MODE === "love") {
    base.sort((a, b) => loveLevel(b.key) - loveLevel(a.key) || a.display.localeCompare(b.display));
  } else {
    base.sort((a, b) => {
      const ar = IDOL_RARITY[a.key] || "rare";
      const br = IDOL_RARITY[b.key] || "rare";
      const ai = RARITY_ORDER.indexOf(ar);
      const bi = RARITY_ORDER.indexOf(br);
      if (ai !== bi) return ai - bi;
      return a.display.localeCompare(b.display);
    });
  }
  return base;
}

function idolCost(idolKey) {
  const r = IDOL_RARITY[idolKey] || "rare";
  return IDOL_SHOP_COST[r] ?? 0;
}

function getAbilityForIdol(idolKey) {
  return Object.values(ABILITIES).find(a => a.ownerIdol === idolKey) || null;
}

function abilityDynamicLine(abilityId, power) {
  const a = ABILITIES[abilityId];
  if (!a) return "";
  const eff = a.effectAtPower ? a.effectAtPower(power) : {};
  const map = {
    scoups_whistle: () => `Reveals all cards for <b>${eff.durationSec.toFixed(2)}s</b>. Timer freezes. (+0.3s/lvl)`,
    seungkwan_rewind: () => `Rewinds timer to <b>${eff.targetSec.toFixed(2)}s</b>. Only usable if timer exceeds that. (-0.5s/lvl)`,
    joshua_rain: () => `Timer runs at <b>50%</b> speed for <b>${eff.durationSec.toFixed(2)}s</b>. (+0.3s/lvl)`,
    mingyu_aura: () => `Shuffles all unmatched cards, reveals them for <b>${eff.durationSec.toFixed(2)}s</b>, then hides and drops. Timer freezes. (+0.3s/lvl)`,
    jeonghan_cheat: () => `Freezes timer for <b>${eff.durationSec.toFixed(2)}s</b>. (+0.4s/lvl)`,
    dk_slash: () => `Reveals calmest row left→right over <b>${eff.totalSec.toFixed(2)}s</b>. Timer pauses. (+0.25s/lvl)`,
    vernon_vibe: () => `Tap 1 card — reveals it and all adjacent cards (cross) for <b>${eff.durationSec.toFixed(2)}s</b>. Timer pauses. (+0.2s/lvl)`,
    dino_history: () => `Reveals last mismatched pair and their actual partners for <b>${eff.durationSec.toFixed(2)}s</b>. Timer freezes. (+0.3s/lvl)`,
    hoshi_leap: () => `Tap 1 card — Tiger auto-matches its pair in <b>${eff.matchTimeSec.toFixed(2)}s</b>. Timer freezes. (-0.1s/lvl)`,
    woozi_reset: () => `Reorders <b>${power >= 17 ? '1/3' : '1/4'}</b> of remaining unmatched cards. (1/3 at max. lvl)`,
    jun_miracle: () => `Removes one random matching pair (no reorder). Fly-out: <b>${eff.ms}ms</b>. (-0.1s/lvl)`,
    wonwoo_hack: () => `Tap <b>${eff.charges}</b> cards — each auto-reveals its match for <b>${eff.highlightSec.toFixed(2)}s</b>. Timer pauses until last flip-back. (+0.06s/lvl)`,
    the8_tea: () => `Permanently reveals <b>${eff.count}</b> unflipped card(s) face-up until matched. Timer does not freeze.`,
  };
  return (map[abilityId] ? map[abilityId]() : "");
}

function toggleIdolSortDropdown(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('idolSortDropdown');
  const btn = document.getElementById('idolSortToggle');
  if (!dd || !btn) return;
  const open = !dd.classList.contains('show');
  dd.classList.toggle('show', open);
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
}

document.addEventListener('click', function closeIdolSortDropdown(e) {
  const dd = document.getElementById('idolSortDropdown');
  const btn = document.getElementById('idolSortToggle');
  if (!dd || !btn || !dd.classList.contains('show')) return;
  if (dd.contains(e.target) || btn.contains(e.target)) return;
  dd.classList.remove('show'); btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
});

function setIdolSortMode(mode, e) {
  if (e) e.stopPropagation();
  IDOL_SORT_MODE = mode;
  const labels = { rarity: 'Rarity Descending', power: 'Power Level Descending', name: 'Name Ascending', matches: 'Most Matches Descending', love: 'Love Level Descending' };
  const label = document.getElementById('idolSortLabel');
  if (label) label.textContent = labels[mode] || 'Rarity Descending';
  const dd = document.getElementById('idolSortDropdown');
  const btn = document.getElementById('idolSortToggle');
  if (dd) dd.classList.remove('show');
  if (btn) { btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  if (dd) dd.querySelectorAll('.lb-opt').forEach(opt => {
    const active = opt.dataset.sort === mode;
    opt.classList.toggle('on', active);
    const check = opt.querySelector('.fa-check');
    if (active && !check) opt.insertAdjacentHTML('beforeend', '<i class="fas fa-check"></i>');
    if (!active && check) check.remove();
  });
  renderIdolsAnimated();
  showToast(`Arranged by ${labels[mode] || mode}`, 'info');
}

function makeIdolCard(idol, owned) {
  const rarity = IDOL_RARITY[idol.key] || "rare";
  const cost = idolCost(idol.key);
  const wrap = document.createElement('div');
  const imgSrc = `./imgs/${idol.key}/1.jpg`;
  const pair = IDOL_THEME[idol.key] || ["#f5c6d0", "#9ec5d9"];
  const [t1, t2] = pair;
  wrap.className = `idol-card themed ${owned ? '' : 'idol-locked'}`;
  wrap.style.setProperty('--idolTheme1', t1);
  wrap.style.setProperty('--idolTheme2', t2);
  const power = getIdolPower(idol.key);
  const ability = owned ? getAbilityForIdol(idol.key) : null;
  const matches = idolMatchCount(idol.key);
  const married = !!GAME_STATE.marriedIdols[idol.key];
  const frameKey = GAME_STATE.idolFrameAssignments?.[idol.key];
  const frame = (GAME_CONFIG.shop.frames || []).find(f => f.key === frameKey && GAME_STATE.ownedFrames?.[f.key]);
  const frameMarkup = frame ? `<div class="idol-frame-fallback" style="--frame-border:${String(frame.border || 'linear-gradient(135deg,#fbbf24,#c084fc)')}"></div>${frame.image ? `<img class="idol-frame-overlay" src="${escapeHtml(frame.image)}" alt="" aria-hidden="true" onerror="this.style.display='none'"/>` : ''}` : '';
  const priceMarkup = '';
  const marriedLabel = ``;
  wrap.innerHTML = `
    <div class="idol-inner">
      <div class="idol-panel">
        ${marriedLabel}
        <div class="idol-match-badge" title="Times matched">${matches}</div>
        <div class="idol-portrait-wrap"><img class="idol-thumb" src="${imgSrc}" alt="${idol.display}" loading="lazy" />${frameMarkup}</div>
        <div class="p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="idol-level-badge" title="Power Level">${power}</span>
                <p class="font-bold text-gray-800 truncate">${idol.display}</p>
              </div>
              <div class="mt-1">
                <span class="rarity-pill">
                  <span class="rarity-dot" style="background:${rarityDotColor(rarity)}"></span>
                  ${rarityDisplayName(rarity)}
                </span>
              </div>
            </div>
            ${priceMarkup}
          </div>

          <div class="mt-3 space-y-2">
            ${
              owned
                ? (married
                  ? ``
                  : ``)
                : ``
            }
          </div>
        </div>
      </div>
    </div>
  `;
  wrap.addEventListener('click', () => openIdolDetailsModal(idol.key));
  return wrap;
}

async function renderIdolsAnimated() {
  const ownedGrid = document.getElementById('ownedIdolsGrid');
  const lockedGrid = document.getElementById('lockedIdolsGrid');
  if (!ownedGrid || !lockedGrid) {
    renderIdols();
    return;
  }
  // Step 1: Record old positions (FIRST)
  const oldPositions = {};
  [...ownedGrid.children, ...lockedGrid.children].forEach(card => {
    const key = card.querySelector('img.idol-thumb')?.alt || Math.random();
    const rect = card.getBoundingClientRect();
    oldPositions[key] = rect;
    card._flipKey = key;
  });
  // Step 2: Re-render DOM (LAST)
  renderIdols();
  // Step 3: Get new positions and animate (INVERT + PLAY)
  const newCards = [...ownedGrid.children, ...lockedGrid.children];
  newCards.forEach(card => {
    const key = card.querySelector('img.idol-thumb')?.alt;
    const oldRect = key ? oldPositions[key] : null;
    if (!oldRect) {
      // New card — fade in
      card.style.opacity = '0';
      card.style.transform = 'scale(0.85)';
      requestAnimationFrame(() => {
        card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
      });
      return;
    }
    const newRect = card.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    const dy = oldRect.top - newRect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    // Snap to old position instantly
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    // Fly to new position
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)';
        card.style.transform = 'translate(0, 0)';
      });
    });
  });
  // Cleanup transforms after animation
  setTimeout(() => {
    newCards.forEach(card => {
      card.style.transition = '';
      card.style.transform = '';
    });
  }, 550);
}

function renderIdols() {
  const ownedGrid = document.getElementById('ownedIdolsGrid');
  const lockedGrid = document.getElementById('lockedIdolsGrid');
  const ownedCountLabel = document.getElementById('ownedCountLabel');
  ownedGrid.innerHTML = "";
  lockedGrid.innerHTML = "";
  const sorted = idolsSortedByCurrentMode();
  const owned = sorted.filter(i => isIdolOwned(i.key));
  const locked = sorted.filter(i => !isIdolOwned(i.key));
  ownedCountLabel.textContent = `${owned.length}/13`;
  if (owned.length === 0) {
    ownedGrid.innerHTML = `<div class="glass-card rounded-2xl p-4 text-sm text-gray-600 col-span-2">You don't own any idols yet. Buy one below!</div>`;
  } else {
    owned.forEach(idol => ownedGrid.appendChild(makeIdolCard(idol, true)));
  }
  if (locked.length === 0) {
    lockedGrid.innerHTML = `<div class="glass-card rounded-2xl p-4 text-sm text-gray-600 col-span-2">You own all idols!</div>`;
  } else {
    locked.forEach(idol => lockedGrid.appendChild(makeIdolCard(idol, false)));
  }
  const ic = document.getElementById('idolsCoins');
  if (ic) ic.textContent = Number(GAME_STATE.coins || 0).toLocaleString();
}
// Married days helper

function marriedDays(idolKey) {
  const rec = GAME_STATE.marriedIdols[idolKey];
  if (!rec?.marriedAt) return 0;
  const diff = Date.now() - rec.marriedAt;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function rarityDisplayName(r) {
  if (r === 'superrare') return 'Super Rare';
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function openIdolDetailsModal(idolKey) {
  const idol = IDOLS.find(i => i.key === idolKey);
  if (!idol) return;
  const owned = isIdolOwned(idolKey);
  const rarity = IDOL_RARITY[idolKey] || "rare";
  const rarityColor = rarityDotColor(rarity);
  const imgSrc = `./imgs/${idolKey}/1.jpg`;
  const power = getIdolPower(idolKey);
  const nextCost = nextPowerUpgradeCost(power);
  const ability = getAbilityForIdol(idolKey);
  const abilityName = ability?.label || "No ability";
  const married = !!GAME_STATE.marriedIdols[idolKey];
  const mdays = marriedDays(idolKey);
  const myName = escapeHtml(currentUser?.displayName || currentUser?.username || 'You');
  const marriedLineTop = married ? `<div class="text-xs font-extrabold text-rose-600 mb-2">💍 ${myName} has been married with ${idol.display} for ${mdays} days.</div>` : '';
  // Love stats (only if married)
  let loveSection = '';
  if (married) {
    const love = GAME_STATE.love[idolKey] || {
      level: 1,
      xp: 0
    };
    const lv = love.level || 1;
    const xp = love.xp || 0;
    const need = LOVE_XP_REQ[lv] || 100;
    const pct = Math.min(100, Math.round((xp / need) * 100));
    loveSection = `
      <div class="mt-2 glass-card rounded-2xl p-3">
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-500 font-bold">Love Lv.</div>
          <div class="text-xs text-gray-900 font-black" id="loveLevelVal">${lv}</div>
        </div>
        <div class="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
          <div id="loveBarFill" class="h-2 love-bar-fill" style="width:${pct}%; background:#ef5da8"></div>
        </div>
        <div class="mt-1 text-[11px] text-gray-600 font-extrabold" id="loveBarText">${xp} / ${need}</div>
      </div>
    `;
  }
  // Upgrade button only if owned
  const upgradeBtn = owned ? (power >= 17 ? `` : `
    <button class="btn-theme black-text" onclick="upgradeIdolPower('${idolKey}')">
      <div class="flex items-center justify-between">
        <span>Upgrade to ${power+1}</span>
        <span class="font-black">${Number(nextCost).toLocaleString()} <img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"></span>
      </div>
    </button>
  `) : '';
  // Gift/Chat if married
  const MG = married ? `
    <button class="glass-card w-full py-3 rounded-2xl font-extrabold text-gray-900" onclick="openSendGiftPanel('${idolKey}')">Send Gift 🎁</button>
  ` : '';
  // Marry button if not married yet and owned
  const marryBtn = (!married && owned) ? `<button class="btn-theme black-text w-full" onclick="confirmMarryIdol('${idolKey}')">Marry 💍</button>` : '';
  // Ability details button – ▶ always blue text
  const abilityButton = married ? `<button type="button" class="view-ability-btn" onclick="openAbilityDetailsModal('${idolKey}')">View Ability</button>` : '';
  // ▼▼▼ THEME GRADIENT BACKGROUND around the top section ▼▼▼
  const pair = IDOL_THEME[idolKey] || ["#f5c6d0", "#9ec5d9"];
  const [t1, t2] = pair;
  let buyBtn = '';
  if (!owned) {
    const cost = idolCost(idolKey);
    buyBtn = `
      <button class="btn-theme black-text w-full" onclick="attemptBuyIdol('${idolKey}', this)">
        <div class="flex items-center justify-between">
          <span>Buy</span>
          <span class="font-black">${cost.toLocaleString()} 💎</span>
        </div>
      </button>
    `;
  }
  openModal("Idol Details", `
    ${marriedLineTop}
    <div class="grid grid-cols-3 gap-3 items-start" style="background:linear-gradient(135deg,${t1},${t2});border-radius:18px;padding:12px;margin-bottom:10px;">
      <div class="col-span-1">
        <div class="relative">
          <img src="${imgSrc}" alt="${idol.display}" class="w-full rounded-2xl object-cover border border-white/60" style="${owned ? '' : 'filter: blur(10px);'}" />
        </div>
      </div>
      <div class="col-span-2">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xl font-black text-gray-900 truncate">${idol.display}</p>
            <div class="mt-1" style="height:3px; border-radius:9999px; background:${rarityColor};"></div>
            <div class="idol-rarity-ability-row"><p class="text-xs text-gray-500 font-bold">${rarityDisplayName(rarity)}</p>${abilityButton}</div>
            ${loveSection}
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500 font-bold">Power</p>
            <p class="text-2xl font-black text-gray-900">${power}</p>
            ${power >= 17 ? `` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="mt-3 space-y-2">
      ${buyBtn}
      ${owned ? upgradeBtn : ''}
      ${owned ? marryBtn : ''}
      ${owned ? MG : ''}
    </div>
  `);
}

function openAbilityDetailsModal(idolKey) {
  const a = getAbilityForIdol(idolKey);
  const power = getIdolPower(idolKey);
  if (!a) {
    showToast('No ability', 'info');
    return;
  }
  // Get the idol's theme colours
  const pair = IDOL_THEME[idolKey] || ["#f5c6d0", "#9ec5d9"];
  const [t1, t2] = pair;
  openModal('Ability Details', `
    <div style="background:linear-gradient(135deg,${t1},${t2}); border-radius:18px; padding:12px; margin-bottom:8px;">
      <p class="text-lg font-black text-gray-900">${a.label}</p>
      <p class="text-sm text-gray-700 mt-2">${abilityDynamicLine(a.id, power) || a.description || ''}</p>
      <div class="mt-3 text-xs font-extrabold text-gray-500">Type: ${a.type === "stackable" ? "Stackable" : a.type === "instantaneous" ? "Instantaneous" : a.type === "unstackable" ? "Unstackable" : a.type} • Power: ${power}</div>
    </div>
  `);
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) {
    closeBtn.onclick = () => openIdolDetailsModal(idolKey);
  }
}

async function upgradeIdolPower(idolKey) {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  if (!isIdolOwned(idolKey)) {
    showToast('You must own this idol first', 'error');
    return;
  }
  const cur = getIdolPower(idolKey);
  if (cur >= 17) return;
  const cost = nextPowerUpgradeCost(cur);
  if (cost == null) return;
  if (GAME_STATE.coins < cost) {
    showToast(`Not enough coins. Need ${Number(cost).toLocaleString()} coins`, 'error');
    return;
  }
  const before = GAME_STATE.coins;
  GAME_STATE.coins -= cost;
  setIdolPower(idolKey, cur + 1);
  renderHub();
  renderIdols();
  animateNumber(document.getElementById('hubCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('gameCoins'), before, GAME_STATE.coins);
  animateNumber(document.getElementById('questsCoins'), before, GAME_STATE.coins);  // U-04: correct id
  animateNumber(document.getElementById('idolsCoins'), before, GAME_STATE.coins);
  const shopCoins = document.getElementById('shopCoins');
  if (shopCoins) animateNumber(shopCoins, before, GAME_STATE.coins);
  await savePlayerState();
  showToast(`Upgraded to Power ${cur+1}!`, 'success');
  openIdolDetailsModal(idolKey);
}

function confirmPurchaseModal({
  title,
  message,
  onYes,
  onNo
}) {
  window.__purchaseYes = () => {
    try {
      onYes?.();
    } finally {
      closeModal();
    }
  };
  window.__purchaseNo = () => {
    try {
      onNo?.();
    } finally {
      closeModal();
    }
  };
  openModal(title, `
    <p class="text-sm text-gray-700">${message}</p>
    <div class="grid grid-cols-2 gap-3 pt-2">
      <button class="btn-confirm-yes" onclick="window.__purchaseYes()">Yes</button>
      <button class="btn-confirm-no"  onclick="window.__purchaseNo()">No</button>
    </div>
  `);
}

async function attemptBuyIdol(idolKey, sourceBtnEl) {
  if (!currentUser) { showToast('Not logged in', 'error'); return; }
  if (isIdolOwned(idolKey)) { showToast('You already own this idol', 'info'); return; }
  const rarity = IDOL_RARITY[idolKey] || 'rare';
  const cost = Number(IDOL_SHOP_COST[rarity] ?? 0);
  if (GAME_STATE.diamonds < cost) { showToast(`Not enough diamonds. Need ${cost.toLocaleString()} 💎`, 'error'); return; }
  const idol = IDOLS.find(i => i.key === idolKey);
  confirmPurchaseModal({
    title: 'Confirm Purchase',
    message: `Buy ${idol?.display || idolKey} for ${cost.toLocaleString()} 💎? Diamonds are premium currency.`,
    onYes: async () => {
      if (isIdolOwned(idolKey)) { showToast('You already own this idol', 'info'); return; }
      if (GAME_STATE.diamonds < cost) { showToast('Not enough diamonds', 'error'); return; }
      GAME_STATE.diamonds -= cost;
      GAME_STATE.ownedIdols[idolKey] = true;
      ensureIdolPowerDefaults();
      renderHub(); renderIdols();
      await savePlayerState();
      showIdolUnlockAnimation(idolKey, () => { showToast('Purchased!', 'success'); renderHub(); renderIdols(); });
    },
    onNo: () => showToast('Purchase cancelled', 'info')
  });
}
