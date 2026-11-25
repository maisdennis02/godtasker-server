const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  verifyAppleIdentityToken,
  resetAppleKeysCache,
  AppleKeysUnavailableError,
} = require('../../src/lib/appleIdentity');
const { BUNDLE_ID, makeKey, appleToken, serveAppleKeys } = require('../support/apple');

let served;
beforeEach(() => {
  resetAppleKeysCache();
  served = serveAppleKeys();
});
afterEach(() => served.restore());

const verify = token => verifyAppleIdentityToken(token, [BUNDLE_ID]);

test('accepts a token signed by a published Apple key and returns its claims', async () => {
  const claims = await verify(appleToken({ sub: 'abc', email: 'x@test.local' }));
  assert.equal(claims.sub, 'abc');
  assert.equal(claims.email, 'x@test.local');
  assert.equal(claims.aud, BUNDLE_ID);
});

test('caches the keys between verifications', async () => {
  await verify(appleToken());
  await verify(appleToken());
  assert.equal(served.calls, 1);
});

test('rejects a token for another app (audience)', async () => {
  await assert.rejects(verify(appleToken({}, { audience: 'com.someone.else' })), /audience/);
});

test('rejects a token from another issuer', async () => {
  await assert.rejects(verify(appleToken({}, { issuer: 'https://evil.example' })), /issuer/);
});

test('rejects an expired token', async () => {
  await assert.rejects(verify(appleToken({}, { expiresIn: -60 })), /expired/);
});

test('rejects a token signed by a key Apple never published', async () => {
  // Same kid as the published key, different private key: signature must fail.
  const forged = makeKey('test-key-1');
  await assert.rejects(verify(appleToken({}, { key: forged })), /invalid signature/);
});

test('rejects an unknown key id without refetching on every attempt', async () => {
  await verify(appleToken()); // warms the cache
  const other = makeKey('rotated-away');
  await assert.rejects(verify(appleToken({}, { key: other })), /unknown key/);
  await assert.rejects(verify(appleToken({}, { key: other })), /unknown key/);
  assert.equal(served.calls, 1);
});

test('rejects garbage and unsigned tokens', async () => {
  await assert.rejects(verify('not-a-jwt'), /Malformed/);
  const none =
    `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'test-key-1' })).toString('base64url')}.` +
    `${Buffer.from(JSON.stringify({ sub: 'x', iss: 'https://appleid.apple.com', aud: BUNDLE_ID })).toString('base64url')}.`;
  await assert.rejects(verify(none));
});

test('reports Apple being unreachable as its own error type', async () => {
  served.keys = new Error('network down');
  await assert.rejects(verify(appleToken()), AppleKeysUnavailableError);
});
