// Which client sent a request, from its User-Agent. No client change needed:
// React Native's fetch identifies itself as okhttp (Android) or CFNetwork/Darwin
// (iOS), and every browser — including Chrome on a phone — starts with Mozilla.
export function clientPlatform(userAgent) {
  const ua = String(userAgent || '');
  if (/okhttp|Dalvik/i.test(ua)) return 'android';
  if (/CFNetwork|Darwin/i.test(ua)) return 'ios';
  if (/^Mozilla\//i.test(ua)) return 'web';
  return 'unknown';
}

// Record that this person just used the app through `req`. Best-effort: a
// failure here must never turn a successful login into an error.
export async function touchClient(user, req) {
  try {
    await user.update({
      last_client: clientPlatform(req.get('user-agent')),
      last_seen_at: new Date(),
    });
  } catch {
    // ignore — the login itself already succeeded
  }
}
