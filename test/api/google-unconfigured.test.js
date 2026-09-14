// Separate process on purpose: config/google.js reads GOOGLE_CLIENT_IDS once.
process.env.GOOGLE_CLIENT_IDS = '';

const { test, before, after } = require('node:test');
const { assert, anon, resetDb, closeDb, stubs } = require('../support/helpers');

before(async () => {
  await resetDb();
});
after(closeDb);

test('POST /sessions/google answers 503 when no client ids are configured', async () => {
  stubs.setGooglePayload({ sub: 's', email: 'e@test.local', email_verified: true });
  const res = await anon().post('/sessions/google').send({ idToken: 'x' });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /not configured/);
});
