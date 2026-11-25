import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Verifies the identity token the iOS app gets from "Sign in with Apple".
// It is a JWT signed (RS256) with one of Apple's rotating public keys, which
// Apple publishes as a JWKS. Nothing here needs an Apple Developer secret.
export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

const KEYS_TTL_MS = 60 * 60 * 1000;
// An unknown `kid` may mean Apple rotated its keys, so it triggers a refetch —
// but at most this often, so junk tokens can't make us hammer Apple.
const MIN_REFETCH_MS = 60 * 1000;

let cache = { keys: null, fetchedAt: 0 };

// Apple could not be reached (or answered garbage): the token may well be
// fine, so callers should answer "try again", not "invalid".
export class AppleKeysUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppleKeysUnavailableError';
  }
}

async function fetchKeys() {
  let body;
  try {
    const res = await fetch(APPLE_KEYS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    throw new AppleKeysUnavailableError(`Could not load Apple signing keys: ${err.message}`);
  }
  if (!body || !Array.isArray(body.keys)) {
    throw new AppleKeysUnavailableError('Apple signing keys response had no keys');
  }
  cache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

async function findKey(kid) {
  const age = Date.now() - cache.fetchedAt;
  let keys = cache.keys;
  if (!keys || age > KEYS_TTL_MS) keys = await fetchKeys();
  let jwk = keys.find(k => k.kid === kid);
  if (!jwk && Date.now() - cache.fetchedAt > MIN_REFETCH_MS) {
    keys = await fetchKeys();
    jwk = keys.find(k => k.kid === kid);
  }
  return jwk || null;
}

// Resolves with the token's claims (sub, email, email_verified, …) or throws.
// `audiences` is the list of bundle / Services IDs this backend accepts.
export async function verifyAppleIdentityToken(token, audiences) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('Malformed Apple identity token');
  }
  const jwk = await findKey(decoded.header.kid);
  if (!jwk) throw new Error('Apple identity token signed with an unknown key');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: audiences,
  });
}

// Test hook: forget the cached keys.
export function resetAppleKeysCache() {
  cache = { keys: null, fetchedAt: 0 };
}
