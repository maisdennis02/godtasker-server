// Absolute, browser-reachable base URL for building public links such as the
// image proxy (GET /files/raw/:key).
//
// On Render, RENDER_EXTERNAL_URL is the full external URL
// (https://<service>.onrender.com). APP_URL there is derived from the service's
// `host` property, which is the INTERNAL hostname (just the service name) — fine
// for private networking but not something an <img> can load — so APP_URL is only
// the local-dev fallback.
export function fileProxyUrl(key) {
  const base =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.APP_URL ||
    'http://localhost:3333';
  const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
  return `${withScheme.replace(/\/+$/, '')}/files/raw/${encodeURIComponent(
    key
  )}`;
}
