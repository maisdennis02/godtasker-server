// Sign in with Apple. APPLE_CLIENT_IDS is a comma-separated list of every
// identifier that may appear as the audience (`aud`) of an Apple identity token
// for this backend:
//   - the iOS app's bundle identifier (com.godtasker.app) — native sign-in
//   - a Services ID, if the web app ever adds "Sign in with Apple"
// Blank = POST /sessions/apple answers 503; the other login paths are unaffected.
export default {
  clientIds: (process.env.APPLE_CLIENT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
};
