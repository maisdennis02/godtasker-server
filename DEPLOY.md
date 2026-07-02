# Deploying the GodTasker backend (public HTTPS)

The server is Express 5 + **Socket.io** (persistent WebSocket) + PostgreSQL, so it
must run as an **always-on service** — not serverless. This repo is set up to
deploy to [Render](https://render.com) via `render.yaml`; the `Dockerfile` is
portable to Railway / Fly.io / any container host.

## One-time setup (Render, ~15 min)

1. **Push this repo to GitHub** (Render deploys from a Git remote).
2. In Render → **New → Blueprint** → select the repo. It reads `render.yaml`
   and provisions two resources: `godtasker-api` (web) + `godtasker-db` (Postgres).
3. Fill the secrets left blank (`sync: false`) in the `godtasker-api` → Environment tab:
   - `AWS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — S3 credentials (bucket is `godtaskerfiles`, **us-east-2**).
   - `FCM_*` — Firebase service-account fields (optional; blank = push disabled, no crash).
     Paste `FCM_PRIVATE_KEY` with literal `\n` sequences exactly as in the JSON — the app
     converts them to newlines at runtime.
   - `DATABASE_URL`, `APP_SECRET`, `NODE_ENV`, `APP_URL`, `AWS_REGION`, `AWS_BUCKET`
     are wired automatically by the blueprint.
4. Deploy. First boot runs `npm run db:migrate` then starts the server.
5. Verify: `curl https://<your-service>.onrender.com/health` → `{"status":"ok"}`.

## Point the mobile app at it

In `godtasker-mobile/eas.json`, replace **both** `https://REPLACE_WITH_PROD_API`
(preview + production) with your Render URL, e.g. `https://godtasker-api.onrender.com`.
Then rebuild: `eas build --profile preview` (or `production`).

## Notes

- **Plans**: `starter` web + `basic-256mb` DB are the persistent tiers. Render's
  *free* web instance sleeps and drops WebSockets — don't use it for this app.
- **SSL**: `src/config/database.js` enables TLS automatically when `DATABASE_URL`
  is set (managed Postgres requires it). Local dev with `DB_*` vars is unchanged.
- **Migrations** run on every deploy via the container `CMD`. Safe for a single instance.
- **CORS/WebSocket** are already open (`origin: '*'`), so no extra config needed.
