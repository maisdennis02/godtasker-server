# Deploying the GodTasker backend (public HTTPS)

The server is Express 5 + **Socket.io** (persistent WebSocket) + PostgreSQL, so it
must run as an **always-on service** — not serverless. This repo is set up to
deploy to [Render](https://render.com) via `render.yaml`; the `Dockerfile` is
portable to Railway / Fly.io / any container host.

## One-time setup (~15 min)

The web service runs on **Render**; the database is a free **Neon** Postgres,
passed in via `DATABASE_URL`.

1. **Create the Neon database** at [neon.tech](https://neon.tech) (free, GitHub login):
   New Project → copy its connection string. Use the **direct** (non-pooled) URL —
   the one *without* `-pooler` in the host — so migrations run cleanly.
2. **Push this repo to GitHub** (Render deploys from a Git remote).
3. In Render → **New → Blueprint** → select the repo. It reads `render.yaml`
   and provisions the `godtasker-api` web service.
4. Fill the secrets left blank (`sync: false`) in `godtasker-api` → Environment tab:
   - `DATABASE_URL` — the Neon connection string from step 1.
   - `AWS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — S3 credentials (bucket `godtaskerfiles`, **us-east-2**).
     Blank = file/avatar uploads fail; everything else works.
   - `FCM_*` — Firebase service-account fields (blank = push disabled, no crash).
     Paste `FCM_PRIVATE_KEY` with literal `\n` sequences exactly as in the JSON — the app
     converts them to newlines at runtime.
   - `NODE_ENV`, `APP_URL`, `AWS_REGION`, `AWS_BUCKET`, `APP_SECRET` are set by the blueprint.
5. Deploy. First boot runs `npm run db:migrate` (against Neon) then starts the server.
6. Verify: `curl https://<your-service>.onrender.com/health` → `{"status":"ok"}`.

## Point the mobile app at it

In `godtasker-mobile/eas.json`, replace **both** `https://REPLACE_WITH_PROD_API`
(preview + production) with your Render URL, e.g. `https://godtasker-api.onrender.com`.
Then rebuild: `eas build --profile preview` (or `production`).

## Notes

- **Plans**: Render `starter` web (~$7/mo) keeps the instance alive — the *free*
  web tier sleeps and drops WebSockets, so don't use it here. Neon's free Postgres
  auto-suspends when idle and wakes on the next query (~1s cold start); fine for
  low traffic. To move to Render's own managed Postgres later, add a `databases:`
  block back to `render.yaml` and point `DATABASE_URL` at it.
- **SSL**: `src/config/database.js` enables TLS automatically when `DATABASE_URL`
  is set (managed Postgres requires it). Local dev with `DB_*` vars is unchanged.
- **Migrations** run on every deploy via the container `CMD`. Safe for a single instance.
- **CORS/WebSocket** are already open (`origin: '*'`), so no extra config needed.
