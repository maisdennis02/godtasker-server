// APPLE_CLIENT_IDS is read once at module load, so set it before the app is
// required. apple-unconfigured.test.js covers the empty case.
process.env.APPLE_CLIENT_IDS = 'com.godtasker.app';

const { test, before, beforeEach, after } = require('node:test');
const {
  assert,
  anon,
  resetDb,
  createUser,
  closeDb,
  User,
  Task,
} = require('../support/helpers');
const { appleToken, makeKey, serveAppleKeys } = require('../support/apple');
const { resetAppleKeysCache } = require('../../src/lib/appleIdentity');

let served;
before(() => {
  served = serveAppleKeys();
});
beforeEach(async () => {
  await resetDb();
});
after(async () => {
  served.restore();
  await closeDb();
});

const apple = body => anon().post('/sessions/apple').send(body);

test('rejects a missing identityToken (400) and a token Apple did not sign (401)', async () => {
  assert.equal((await apple({})).status, 400);
  const forged = appleToken({}, { key: makeKey('test-key-1') });
  const res = await apple({ identityToken: forged });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid Apple token');
  assert.equal(await User.count({ where: { apple_id: 'apple-sub-1' } }), 0);
});

test('rejects a token minted for another app', async () => {
  const res = await apple({ identityToken: appleToken({}, { audience: 'com.someone.else' }) });
  assert.equal(res.status, 401);
});

test('creates a new account from the name the app passes, with the welcome task', async () => {
  await createUser({ user_name: 'dennislee' }); // forces the suffix path
  const res = await apple({
    identityToken: appleToken(),
    fullName: { givenName: 'Dennis', familyName: 'Lee' },
    locale: 'pt-BR',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.email, 'a@test.local');
  assert.equal(res.body.user.first_name, 'Dennis');
  assert.equal(res.body.user.last_name, 'Lee');
  assert.equal(res.body.user.has_password, false);
  assert.match(res.body.user.user_name, /^dennislee\d{4}$/);
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.body.user.apple_id, undefined, 'apple_id never leaves the server');

  const stored = await User.findOne({ where: { email: 'a@test.local' } });
  assert.equal(stored.apple_id, 'apple-sub-1');
  assert.equal(stored.password_hash, null);
  assert.equal(stored.locale, 'pt-BR');
  const welcome = await Task.findOne({ where: { assignee_id: stored.id } });
  assert.equal(welcome.onboarding_step, 1);
});

test('a hidden (relay) email without a name gets a neutral user_name', async () => {
  const res = await apple({
    identityToken: appleToken({
      email: 'x7k2m9q4zz@privaterelay.appleid.com',
      is_private_email: 'true',
    }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.match(res.body.user.user_name, /^user(\d{4})?$/);
  assert.equal(res.body.user.first_name, null);
});

test('without a name, a real email seeds the user_name', async () => {
  const res = await apple({ identityToken: appleToken({ email: 'maria.silva@test.local' }) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.user_name, 'mariasilva');
});

test('ignores a malformed fullName instead of failing', async () => {
  const res = await apple({
    identityToken: appleToken(),
    fullName: { givenName: { nested: true }, familyName: '   ' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.first_name, null);
  assert.equal(res.body.user.last_name, null);
});

test('returning Apple user signs in by apple_id, even with no email in the token', async () => {
  const first = await apple({ identityToken: appleToken() });
  const second = await apple({
    identityToken: appleToken({ email: undefined, email_verified: undefined }),
  });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.user.id, first.body.user.id);
  assert.equal(await User.count({ where: { apple_id: 'apple-sub-1' } }), 1);
  // Only one welcome task, sent on the first sign-in.
  assert.equal(await Task.count({ where: { assignee_id: first.body.user.id } }), 1);
});

test('links an existing password account with the same verified email', async () => {
  const existing = await createUser({ email: 'a@test.local', user_name: 'existing' });
  const res = await apple({
    identityToken: appleToken({ email_verified: true }), // boolean form
    fullName: { givenName: 'Ignored', familyName: 'Name' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.id, existing.id);
  assert.equal(res.body.user.user_name, 'existing');
  assert.equal(res.body.user.has_password, true);
  const stored = await User.findByPk(existing.id);
  assert.equal(stored.apple_id, 'apple-sub-1');
  // Linking is not a new account: no welcome task, and the profile is untouched.
  assert.equal(await Task.count({ where: { assignee_id: existing.id } }), 0);
  assert.notEqual(stored.first_name, 'Ignored');
});

test('an unverified or missing email cannot create or claim an account', async () => {
  await createUser({ email: 'a@test.local' });
  const unverified = await apple({ identityToken: appleToken({ email_verified: 'false' }) });
  assert.equal(unverified.status, 401);
  assert.match(unverified.body.error, /not verified/);
  const missing = await apple({
    identityToken: appleToken({ sub: 'apple-sub-2', email: undefined }),
  });
  assert.equal(missing.status, 401);
  const stored = await User.findOne({ where: { email: 'a@test.local' } });
  assert.equal(stored.apple_id, null);
  assert.equal(await User.count({ where: { apple_id: 'apple-sub-2' } }), 0);
});

test('a deactivated account cannot sign in with Apple', async () => {
  await createUser({ email: 'a@test.local', apple_id: 'apple-sub-1', canceled_at: new Date() });
  const res = await apple({ identityToken: appleToken() });
  assert.equal(res.status, 401);
});

test('an Apple sign-in records the client platform and the time', async () => {
  const res = await anon()
    .post('/sessions/apple')
    .set('User-Agent', 'LalaTask/1 CFNetwork/1568.300.101 Darwin/24.2.0')
    .send({ identityToken: appleToken() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await User.findByPk(res.body.user.id);
  assert.equal(stored.last_client, 'ios');
  assert.ok(stored.last_seen_at, 'last_seen_at stamped');
});

test('answers 503 (not 401) when Apple cannot be reached to verify', async () => {
  resetAppleKeysCache();
  const keys = served.keys;
  served.keys = new Error('network down');
  try {
    const res = await apple({ identityToken: appleToken() });
    assert.equal(res.status, 503);
    assert.match(res.body.error, /temporarily unavailable/);
  } finally {
    served.keys = keys;
  }
});
