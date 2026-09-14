// Process-wide stubs for the outbound integrations. Loaded by env.js, so they
// are in place before any controller is required.
const Module = require('module');
const path = require('path');
const admin = require('firebase-admin');

// ─── Push notifications ─────────────────────────────────────────────────────
// Controllers call firebaseAdmin.messaging().send(msg) fire-and-forget. Capture
// every message so tests can assert recipient token + localized copy.
const fcm = { sent: [], failNext: null };
const messaging = () => ({
  async send(msg) {
    if (fcm.failNext) {
      const err = fcm.failNext;
      fcm.failNext = null;
      throw err;
    }
    fcm.sent.push(msg);
    return `stub-message-${fcm.sent.length}`;
  },
});
// The namespace exposes `messaging` / `apps` as prototype getters; own-property
// definitions shadow them for every importer of the module object.
for (const target of new Set([admin, admin.default].filter(Boolean))) {
  Object.defineProperty(target, 'messaging', { value: messaging, configurable: true });
  // approvalOverdueNotifier checks firebaseAdmin.apps.length before sending.
  Object.defineProperty(target, 'apps', {
    get: () => [{ name: '[stub]' }],
    configurable: true,
  });
}

// ─── Email (src/lib/mail.js) ────────────────────────────────────────────────
// Replace the module in the require cache so PasswordResetController's
// `import sendMail from '../../lib/mail'` gets the stub. The password-reset
// test reads the 6-digit code out of the captured text.
const mail = { sent: [], failNext: null };
const mailPath = path.resolve(__dirname, '../../src/lib/mail.js');
const mailModule = new Module(mailPath, null);
mailModule.filename = mailPath;
mailModule.loaded = true;
mailModule.exports = {
  __esModule: true,
  default: async message => {
    if (mail.failNext) {
      const err = mail.failNext;
      mail.failNext = null;
      throw err;
    }
    mail.sent.push(message);
    return true;
  },
};
require.cache[mailPath] = mailModule;

// ─── Google ID token verification ───────────────────────────────────────────
// `setGooglePayload(payload)` makes verifyIdToken resolve with that payload;
// `setGooglePayload(new Error(...))` makes it reject (invalid token).
const google = { next: null };
const { OAuth2Client } = require('google-auth-library');
OAuth2Client.prototype.verifyIdToken = async function verifyIdTokenStub() {
  const next = google.next;
  if (next instanceof Error) throw next;
  if (!next) throw new Error('stub: no Google payload configured');
  return { getPayload: () => next };
};

module.exports = {
  fcm,
  mail,
  setGooglePayload(payload) {
    google.next = payload;
  },
  reset() {
    fcm.sent.length = 0;
    fcm.failNext = null;
    mail.sent.length = 0;
    mail.failNext = null;
    google.next = null;
  },
};
