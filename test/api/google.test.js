// GOOGLE_CLIENT_IDS is read once at module load, so set it before the app is
// required. google-unconfigured.test.js covers the empty case.
process.env.GOOGLE_CLIENT_IDS = 'web-client-id.apps.googleusercontent.com';

const { test, beforeEach, after } = require('node:test');
const {
  assert,
  anon,
  resetDb,
  createUser,
  closeDb,
  stubs,
  User,
  Task,
} = require('../support/helpers');
const File = require('../../src/app/models/File').default;
const s3 = require('../../src/config/s3').default;

beforeEach(async () => {
  await resetDb();
});
after(closeDb);

const payload = overrides => ({
  sub: 'google-sub-1',
  email: 'g@test.local',
  email_verified: true,
  name: 'Dennis Lee',
  given_name: 'Dennis',
  family_name: 'Lee',
  ...overrides,
});

const google = body => anon().post('/sessions/google').send(body);

test('rejects a missing idToken (400) and a token Google refuses (401)', async () => {
  assert.equal((await google({})).status, 400);
  stubs.setGooglePayload(new Error('Wrong recipient, payload audience != requiredAudience'));
  const res = await google({ idToken: 'x' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid Google token');
});

test('creates a new account with a derived unique user_name and the welcome task', async () => {
  await createUser({ user_name: 'dennislee' }); // forces the suffix path
  stubs.setGooglePayload(payload());
  const res = await google({ idToken: 'x', locale: 'pt-BR' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.email, 'g@test.local');
  assert.equal(res.body.user.first_name, 'Dennis');
  assert.equal(res.body.user.has_password, false);
  assert.match(res.body.user.user_name, /^dennislee\d{4}$/);
  assert.equal(typeof res.body.token, 'string');

  const stored = await User.findOne({ where: { email: 'g@test.local' } });
  assert.equal(stored.google_id, 'google-sub-1');
  assert.equal(stored.password_hash, null);
  assert.equal(stored.locale, 'pt-BR');
  const welcome = await Task.findOne({ where: { assignee_id: stored.id } });
  assert.match(welcome.name, /^Bem-vindo/);
});

test('returning Google user signs in by google_id even if the email changed', async () => {
  stubs.setGooglePayload(payload());
  const first = await google({ idToken: 'x' });
  stubs.setGooglePayload(payload({ email: 'renamed@test.local' }));
  const second = await google({ idToken: 'x' });
  assert.equal(second.status, 200);
  assert.equal(second.body.user.id, first.body.user.id);
  assert.equal(await User.count({ where: { google_id: 'google-sub-1' } }), 1);
  // Only one welcome task, sent on the first sign-in.
  assert.equal(await Task.count({ where: { assignee_id: first.body.user.id } }), 1);
});

test('links an existing password account with the same verified email', async () => {
  const existing = await createUser({ email: 'g@test.local', user_name: 'existing' });
  stubs.setGooglePayload(payload());
  const res = await google({ idToken: 'x' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, existing.id);
  assert.equal(res.body.user.user_name, 'existing');
  assert.equal(res.body.user.has_password, true);
  const stored = await User.findByPk(existing.id);
  assert.equal(stored.google_id, 'google-sub-1');
  // Linking is not a new account: no second welcome task.
  assert.equal(await Task.count({ where: { assignee_id: existing.id } }), 0);
});

test('an unverified Google email cannot claim an existing account', async () => {
  await createUser({ email: 'g@test.local' });
  stubs.setGooglePayload(payload({ email_verified: false }));
  const res = await google({ idToken: 'x' });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /not verified/);
  const stored = await User.findOne({ where: { email: 'g@test.local' } });
  assert.equal(stored.google_id, null);
});

test('a deactivated account cannot sign in with Google', async () => {
  await createUser({ email: 'g@test.local', google_id: 'google-sub-1', canceled_at: new Date() });
  stubs.setGooglePayload(payload());
  const res = await google({ idToken: 'x' });
  assert.equal(res.status, 401);
});

test('seeds the avatar from the Google photo on first sign-in (never overwrites)', async () => {
  const puts = [];
  const originalSend = s3.send;
  const originalFetch = globalThis.fetch;
  s3.send = async cmd => {
    puts.push(cmd.input);
    return {};
  };
  globalThis.fetch = async url => ({
    ok: true,
    headers: new Map([['content-type', 'image/jpeg']]),
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    _url: url,
  });
  try {
    stubs.setGooglePayload(payload({ picture: 'https://lh3.googleusercontent.com/a/photo=s96-c' }));
    const res = await google({ idToken: 'x' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.user.avatar, 'session carries the avatar');
    assert.match(res.body.user.avatar.url, /\/files\/raw\/google-avatar-/);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-bucket');
    assert.match(puts[0].Key, /^google-avatar-\d+-\d+\.jpg$/);

    // Second sign-in: avatar already set, no new upload.
    const again = await google({ idToken: 'x' });
    assert.equal(again.status, 200);
    assert.equal(puts.length, 1);
    assert.equal(await File.count(), 1);
  } finally {
    s3.send = originalSend;
    globalThis.fetch = originalFetch;
  }
});

test('a failing avatar import never fails the sign-in', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  try {
    stubs.setGooglePayload(payload({ picture: 'https://example.invalid/p.jpg' }));
    const res = await google({ idToken: 'x' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.avatar, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
