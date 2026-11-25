// Separate process on purpose: config/apple.js reads APPLE_CLIENT_IDS once.
process.env.APPLE_CLIENT_IDS = '';

const { test, before, after } = require('node:test');
const { assert, anon, resetDb, closeDb } = require('../support/helpers');
const { appleToken, serveAppleKeys } = require('../support/apple');

let served;
before(async () => {
  served = serveAppleKeys();
  await resetDb();
});
after(async () => {
  served.restore();
  await closeDb();
});

test('POST /sessions/apple answers 503 when no client ids are configured', async () => {
  const res = await anon().post('/sessions/apple').send({ identityToken: appleToken() });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /not configured/);
  assert.equal(served.calls, 0, 'never even asks Apple for keys');
});
