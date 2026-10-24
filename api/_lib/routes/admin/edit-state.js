const { handler, send, httpError, rateLimit } = require('../../http');
const { requireAdminSession, auditLog } = require('../../auth');
const { getAdmin } = require('../../firebase');
const { seasonInfo, seedLedger } = require('../../awards');

const SEG_RE = /^[A-Za-z0-9_:@+~\-]{1,120}$/;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function parsePath(raw) {
  if (typeof raw !== 'string') throw httpError(400, 'Invalid field path');
  const parts = raw.split('/');
  if (!parts.length || parts.length > 12 || parts.some(part => !SEG_RE.test(part) || BLOCKED_KEYS.has(part))) {
    throw httpError(400, 'Invalid field path');
  }
  return parts;
}

function validValue(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 12000) return value;
  throw httpError(400, 'Only text, numbers, booleans, or empty values can be saved');
}

function getPath(root, parts) {
  let current = root;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function equalValue(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

module.exports = handler(['POST'], async (req, res) => {
  const decoded = await requireAdminSession(req);
  rateLimit(`edit-state:${decoded.uid}`, 120, 10 * 60 * 1000);

  const body = req.body || {};
  const uid = typeof body.uid === 'string' ? body.uid : '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw httpError(400, 'Invalid uid');
  if (!body.updates || typeof body.updates !== 'object' || Array.isArray(body.updates)) throw httpError(400, 'Missing updates');
  const entries = Object.entries(body.updates);
  if (!entries.length) throw httpError(400, 'Nothing to update');
  if (entries.length > 300 || JSON.stringify(body.updates).length > 200000) throw httpError(400, 'Too many changes');

  const parsed = entries.map(([path, rawValue]) => ({ path, parts: parsePath(path), value: validValue(rawValue) }));
  const db = getAdmin().database();
  const userRef = db.ref(`users/${uid}`);
  const userSnap = await userRef.once('value');
  if (!userSnap.exists()) throw httpError(404, 'User not found');
  const stateRef = userRef.child('playerState');
  const stateSnap = await stateRef.once('value');
  const beforeState = stateSnap.val() || {};
  const patch = {};
  const changes = [];

  for (const item of parsed) {
    const before = getPath(beforeState, item.parts);
    const after = item.value;
    if (equalValue(before, after)) continue;
    patch[item.parts.join('/')] = after;
    changes.push({ path: `playerState/${item.parts.join('/')}`, from: before === undefined ? null : before, to: after });
  }

  if (!changes.length) return send(res, 200, { ok: true, updated: 0, changes: [] });
  await stateRef.update(patch);

  // Keep the authoritative award ledger aligned with admin-edited SVT Pass fields.
  // Pass claims and XP are checked against guard/{uid}/a by the award endpoint;
  // editing only playerState would otherwise leave the UI and claim service out of sync.
  const passChanges = changes.filter(change =>
    change.path === 'playerState/meta/season/sp' ||
    change.path === 'playerState/meta/season/boxes' ||
    /^playerState\/meta\/season\/claimed\/t\d{1,2}$/.test(change.path)
  );
  if (passChanges.length) {
    const now = Date.now();
    const activeSeason = seasonInfo(now);
    const updatedState = (await stateRef.once('value')).val() || {};
    const ledgerRef = db.ref(`guard/${uid}/a`);
    await ledgerRef.transaction(current => {
      const ledger = current && typeof current === 'object' && current.v
        ? JSON.parse(JSON.stringify(current))
        : seedLedger(updatedState, now);
      if (!ledger.se || ledger.se.id !== activeSeason.id) {
        if (ledger.se && typeof ledger.se === 'object') {
          ledger.prevSe = {
            id: ledger.se.id || '',
            num: Number(ledger.se.num) || 0,
            claimed: ledger.se.claimed && typeof ledger.se.claimed === 'object' ? ledger.se.claimed : {},
            sp: Number(ledger.se.sp) || 0
          };
        }
        ledger.se = { id: activeSeason.id, num: activeSeason.num, monthKey: activeSeason.monthKey, claimed: {}, sp: 0, runs: 0, passed: {} };
      }
      if (!ledger.se.claimed || typeof ledger.se.claimed !== 'object' || Array.isArray(ledger.se.claimed)) ledger.se.claimed = {};
      for (const change of passChanges) {
        if (change.path === 'playerState/meta/season/sp') {
          ledger.se.sp = Math.max(0, Math.min(20000, Math.floor(Number(change.to) || 0)));
        } else if (change.path === 'playerState/meta/season/boxes') {
          ledger.sb = Math.max(0, Math.min(1000000000, Math.floor(Number(change.to) || 0)));
        } else {
          const match = change.path.match(/claimed\/(t\d{1,2})$/);
          if (!match) continue;
          if (change.to !== null && Number(change.to) > 0) ledger.se.claimed[match[1]] = 1;
          else delete ledger.se.claimed[match[1]];
        }
      }
      ledger.sb = Math.max(0, Math.min(1000000000, Math.floor(Number(ledger.sb) || 0)));
      return ledger;
    });
  }

  const adminEmail = typeof decoded.email === 'string' ? decoded.email : null;
  const auditDetail = {
    uid,
    username: userSnap.child('username').val() || '',
    adminEmail,
    changes
  };
  await auditLog(decoded.uid, 'player-state-edit', auditDetail);
  await db.ref(`adminPlayerHistory/${uid}/adminChangeHistory`).push().set({
    at: Date.now(),
    by: decoded.uid,
    action: 'player-state-edit',
    detail: auditDetail
  }).catch((e) => console.error('[admin-change-history] player state edit failed:', e && e.message));

  for (const change of changes) {
    if (change.path !== 'playerState/coins') continue;
    const from = Number(change.from) || 0;
    const to = Number(change.to) || 0;
    await db.ref(`adminPlayerHistory/${uid}/earningsHistory`).push().set({
      at: Date.now(),
      type: 'admin_adjustment',
      source: 'admin',
      adminUid: decoded.uid,
      adminEmail,
      field: 'coins',
      amount: to - from,
      coinsBefore: from,
      coinsAfter: to,
      from,
      to
    }).catch((e) => console.error('[earnings-history] admin adjustment failed:', e && e.message));
  }

  send(res, 200, { ok: true, updated: changes.length, changes });
});
