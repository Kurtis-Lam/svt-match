const admin = require('firebase-admin');

function getAdmin() {
  if (admin.apps.length) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    throw new Error('Missing Firebase environment variables');
  }

  if (projectId !== 'svt-match') console.error('[firebase] FIREBASE_PROJECT_ID is "' + projectId + '" but the game uses "svt-match" - ID tokens will be rejected');
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    databaseURL
  });
  return admin;
}

module.exports = { getAdmin };