function openModal(title, bodyHtml) {
  title = String(title || '');  // S-04: use textContent — safe, no double-encode
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) { closeBtn.style.display = ''; closeBtn.onclick = closeModal; }
  document.getElementById('modalOverlay').classList.add('show');
}

function openModalWithHtmlTitle(titleHtml, bodyHtml) {
  document.getElementById('modalTitle').innerHTML = titleHtml;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.style.display = 'none'; // custom header has its own back/close
  document.getElementById('modalOverlay').classList.add('show');
}

function openUndismissibleModal(title, bodyHtml) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const closeBtn = document.getElementById('modalCloseBtn');
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  // Hide the close (X) button completely
  if (closeBtn) closeBtn.style.display = 'none';
  // Remove the background‑click behaviour
  overlay.onclick = null;
  overlay.classList.add('show');
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('show');
  document.getElementById('modalBody').innerHTML = '';
  // Always show the close button again (in case it was hidden)
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.style.display = '';
  // Restore the default background‑click handler for normal modals
  overlay.onclick = function(e) {
    if (e.target === overlay) closeModal();
  };
}

function setModalError(message) {
  message = String(message || '');  // S-05: force string, block DOM-object injection
  const el = document.getElementById('modalError');
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.classList.remove('show');
  } else {
    el.textContent = message;  // S-05: textContent is safe — do NOT change to innerHTML
    el.classList.add('show');
  }
}
// FIX: Implement Change Theme modal

function openChangeThemeModal() {
  if (!currentUser) {
    showToast('Not logged in', 'error');
    return;
  }
  const married = Object.keys(GAME_STATE.marriedIdols || {}).filter(k => GAME_STATE.marriedIdols[k]);
  if (!married.length) {
    openModal("Change Theme", `
      <div class="glass-card rounded-2xl p-4">
        <p class="text-sm text-gray-700 font-semibold">No married idols yet.</p>
        <p class="text-xs text-gray-500 font-bold mt-1">Marry an idol first, then you can select it as your app theme.</p>
      </div>
      <button class="glass-card w-full py-3 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Close</button>
    `);
    return;
  }
  const rows = married.map(k => {
    const idol = IDOLS.find(i => i.key === k);
    const img = `./imgs/${k}/1.jpg`;
    const selected = (GAME_STATE.equippedIdolKey === k);
    return `
      <button class="select-row ${selected ? 'ring-2 ring-blue-500' : ''}" onclick="equipIdol('${k}')">
        <img src="${img}" alt="${idol?.display || k}" />
        <div class="flex-1 min-w-0">
          <div class="name truncate">${idol?.display || k}</div>
          <div class="sub">Tap to set theme</div>
        </div>
        ${selected ? '<div class="tick"><i class="fas fa-check"></i></div>' : ''}
      </button>
    `;
  }).join('');
  openModal("Change Theme", `
    <div class="text-xs text-gray-500 font-bold mb-2">Choose a <b>married idol</b> to set your app theme.</div>
    <div class="select-main-list space-y-2">${rows}</div>
    <div class="grid grid-cols-1 gap-2 pt-3">
      <button class="glass-card py-3 rounded-2xl font-extrabold text-gray-900" onclick="closeModal()">Close</button>
    </div>
  `);
}

function openStreakInfoModal() {
  openModal(`ℹ️ Showtime Streak`, `
    <div class="glass-card rounded-2xl p-4">
      <p class="text-sm text-gray-700 font-semibold">
        To increase your streak, you must complete each level within 20 seconds.
      </p>
    </div>
  `);
}

function openSpotlightStreakInfoModal() {
  openModal(`ℹ️ Spotlight Streak`, `
    <div class="glass-card rounded-2xl p-4">
      <p class="text-sm text-gray-700 font-semibold">
        To increase your spotlight streak, you must get at least 7 correct hits in a single Spotlight game.
      </p>
    </div>
  `);
}

function openCoinsInfoModal() {
  openModalWithHtmlTitle(`<span style="display:flex;align-items:center;gap:6px;"><img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;">Coins &amp; Diamonds</span>`, `
    <div class="glass-card rounded-2xl p-4 space-y-3">
      <div>
        <p class="text-sm text-gray-800 font-extrabold flex items-center gap-1"><img src="./imgs/assets/coins.png" style="width:1em;height:1em;vertical-align:middle;"> Earn coins</p>
        <ul class="text-xs text-gray-600 font-bold list-disc pl-5 mt-1 space-y-1">
          <li>Play Showtime, Spotlight, Snakeventeen &amp; Choreo Echo</li>
          <li>Spin the Daily Draw &amp; open Daily Boxes</li>
          <li>Complete quests &amp; win battles</li>
          <li>Collect love coins from married idols, etc.</li>
        </ul>
      </div>
      <div>
        <p class="text-sm text-gray-800 font-extrabold">💎 Earn diamonds</p>
        <ul class="text-xs text-gray-600 font-bold list-disc pl-5 mt-1 space-y-1">
          <li>Climb the Season Pass levels</li>
          <li>Special rewards &amp; events, etc.</li>
        </ul>
      </div>
    </div>
  `);
}