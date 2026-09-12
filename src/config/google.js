// Google Sign-In. GOOGLE_CLIENT_IDS is a comma-separated list of every OAuth
// client id that may mint ID tokens for this backend:
//   - the Web client id (used by godtasker-web, and as `webClientId` by the
//     Android app — Android ID tokens carry the WEB client id as audience)
//   - the iOS client id, once the iOS app exists
// All of them must belong to the same Google Cloud project.
export default {
  clientIds: (process.env.GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
};
