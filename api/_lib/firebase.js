const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

function env(name) {
  let v = String(process.env[name] || '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1).trim();
  return v;
}

function configError(message) {
  const e = new Error(message);
  e.status = 500;
  e.code = 'config';
  e.expose = true;
  return e;
}

let facade = null;

function createApp() {
  const projectId = env('FIREBASE_PROJECT_ID');
  const clientEmail = env('FIREBASE_CLIENT_EMAIL');
  const privateKey = env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const databaseURL = env('FIREBASE_DATABASE_URL') || (projectId ? 'https://' + projectId + '-default-rtdb.firebaseio.com' : '');

  const missing = [];
  if (!projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
  if (!databaseURL) missing.push('FIREBASE_DATABASE_URL');
  if (missing.length) throw configError('Server is missing environment variables: ' + missing.join(', '));
  if (!/BEGIN [A-Z ]*PRIVATE KEY/.test(privateKey)) throw configError('FIREBASE_PRIVATE_KEY is not a valid PEM private key');

  if (projectId !== 'svt-match') console.error('[firebase] FIREBASE_PROJECT_ID is "' + projectId + '" but the game uses "svt-match" - ID tokens will be rejected');
  try {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      databaseURL
    });
  } catch (e) {
    console.error('[firebase] initializeApp failed:', e && e.message);
    throw configError('Firebase Admin failed to initialise: ' + String((e && e.message) || e).slice(0, 160));
  }
}

function getAdmin() {
  if (facade) return facade;
  const existing = getApps();
  const app = existing.length ? existing[0] : createApp();
  facade = {
    app,
    auth: () => getAuth(app),
    database: () => getDatabase(app),
    firestore: () => require('firebase-admin/firestore').getFirestore(app)
  };
  return facade;
}

module.exports = { getAdmin };