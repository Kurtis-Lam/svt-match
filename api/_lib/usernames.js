const { getAdmin } = require('./firebase');
const { httpError } = require('./http');

const NAME_RE = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;
const EMAIL_DOMAIN = 'svtmatch.app';

function normalize(u) {
  return String(u || '').trim().toLowerCase();
}

function validate(u) {
  const n = normalize(u);
  if (n.length < 3) throw httpError(400, 'Username must be at least 3 characters');
  if (n.length > 30) throw httpError(400, 'Username must be 30 characters or fewer');
  if (!NAME_RE.test(n)) throw httpError(400, 'Usernames can use letters, numbers, dots, dashes and underscores');
  return n;
}

function toEmail(u) {
  return `${normalize(u)}@${EMAIL_DOMAIN}`;
}

async function findAuthByUsername(u) {
  try {
    return await getAdmin().auth().getUserByEmail(toEmail(u));
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') return null;
    throw e;
  }
}

async function renameUser(uid, newName) {
  const name = validate(newName);
  const fb = getAdmin();
  const userRef = fb.database().ref(`users/${uid}`);
  const snap = await userRef.once('value');
  if (!snap.exists()) throw httpError(404, 'User not found');
  const user = snap.val() || {};
  const oldName = normalize(user.username);
  if (oldName === name) throw httpError(400, 'Same as current username');
  const clash = await findAuthByUsername(name);
  if (clash && clash.uid !== uid) throw httpError(409, 'Username already taken');
  try {
    await fb.auth().updateUser(uid, { email: toEmail(name) });
  } catch (e) {
    if (e && e.code === 'auth/email-already-exists') throw httpError(409, 'Username already taken');
    throw e;
  }
  const updates = { [`users/${uid}/username`]: name };
  if (user.playerState) updates[`users/${uid}/playerState/username`] = name;

  // When the display name is still the default username, keep it aligned with the rename.
  // Preserve custom display names chosen by the player.
  const oldDisplayName = String(user.displayName || '').trim();
  const displayNameUsesUsername = !oldDisplayName || normalize(oldDisplayName) === oldName;
  if (displayNameUsesUsername) {
    updates[`users/${uid}/displayName`] = name;
    if (user.playerState) updates[`users/${uid}/playerState/displayName`] = name;
  }

  await fb.database().ref().update(updates);
  return { oldName, username: name, displayName: displayNameUsesUsername ? name : oldDisplayName };
}

module.exports = { normalize, validate, toEmail, findAuthByUsername, renameUser, EMAIL_DOMAIN };
