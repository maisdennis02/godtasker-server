// A stand-in for Apple's signing service. Tests mint real RS256 identity
// tokens with a throwaway key and serve its public half where the server
// expects Apple's JWKS, so the production verification code runs unchanged.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { APPLE_ISSUER, APPLE_KEYS_URL } = require('../../src/lib/appleIdentity');

const BUNDLE_ID = 'com.godtasker.app';

function makeKey(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    kid,
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' },
  };
}

const appleKey = makeKey('test-key-1');

// Sign an identity token. `options` can override the signing key, kid,
// issuer, audience or lifetime to build tokens the server must reject.
function appleToken(claims = {}, options = {}) {
  const key = options.key || appleKey;
  return jwt.sign(
    { sub: 'apple-sub-1', email: 'a@test.local', email_verified: 'true', ...claims },
    key.privateKey,
    {
      algorithm: 'RS256',
      keyid: options.kid || key.kid,
      issuer: options.issuer || APPLE_ISSUER,
      audience: options.audience || BUNDLE_ID,
      expiresIn: options.expiresIn || '10m',
    }
  );
}

// Replace global fetch so the Apple keys URL answers with `keys` (or fails
// when `keys` is an Error). Returns { calls, restore }.
function serveAppleKeys(keys = [appleKey.jwk]) {
  const original = globalThis.fetch;
  const state = { calls: 0, keys, restore: () => (globalThis.fetch = original) };
  globalThis.fetch = async (url, init) => {
    if (String(url) !== APPLE_KEYS_URL) return original(url, init);
    state.calls += 1;
    if (state.keys instanceof Error) throw state.keys;
    return { ok: true, status: 200, json: async () => ({ keys: state.keys }) };
  };
  return state;
}

module.exports = { BUNDLE_ID, appleKey, makeKey, appleToken, serveAppleKeys };
