# GodTasker Server

Backend for **GodTasker** — a task/services marketplace where **users** post tasks and **workers** complete them. REST API + Socket.IO for realtime updates + FCM (Firebase Cloud Messaging) for push notifications.

## Stack

- **Node.js 22+** (see `.nvmrc`)
- **Express 5** + **Socket.IO 4**
- **PostgreSQL 17** via **Sequelize 6**
- **Sucrase** for `import` syntax in dev (no separate transpile step)
- **JWT** auth, **bcryptjs** password hashing, **Yup** validation
- **Multer** + **multer-s3** + **@aws-sdk/client-s3 v3** for image uploads
- **firebase-admin 13** for push notifications

## Quick start

```bash
# 1. Use the right Node version
nvm use            # or: nvm install $(cat .nvmrc)

# 2. Install deps
npm install

# 3. Copy and edit the env file
cp .env.example .env
$EDITOR .env

# 4. Bring up Postgres
docker compose up -d

# 5. Run migrations
npm run db:migrate

# 6. Start the dev server
npm run dev
```

Server listens on `http://localhost:3333` by default.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with nodemon + sucrase (auto-reload) |
| `npm run dev:debug` | Same, with `--inspect` for the Node debugger |
| `npm run build` | Transpile `src/` → `dist/` for production |
| `npm start` | Run the transpiled `dist/server.js` |
| `npm run lint` | ESLint over `src/` |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier write over `src/` |
| `npm run db:migrate` | Run pending Sequelize migrations |
| `npm run db:migrate:undo` | Roll back the last migration |
| `npm run db:seed` | Run all Sequelize seeders |

## Project layout

```
src/
├── server.js              # Boots HTTP + Socket.IO listener
├── http.js                # Wires Express into http.Server + Socket.IO
├── app.js                 # Express app: middleware + routes
├── routes.js              # Public routes, then authMiddleware, then private routes
├── config/
│   ├── auth.js            # JWT secret + algorithm (from env)
│   ├── database.js        # Sequelize config (also read by sequelize-cli)
│   └── s3.js              # Shared @aws-sdk S3 client
├── database/
│   └── index.js           # Sequelize bootstrap + firebase-admin init
└── app/
    ├── controllers/       # Request handlers (Task/, User/, Worker/, Message/, …)
    ├── middlewares/       # auth, s3Upload (with profile/signature variants)
    └── models/            # Sequelize models
migrations/                # Sequelize migrations (run via npm run db:migrate)
docker-compose.yml         # Local Postgres for development
```

## Environment variables

See `.env.example` for the full list. The important ones:

- **`APP_SECRET`** — JWT signing secret. **Must be set** in production.
- **`DB_*`** — Postgres connection. Defaults match `docker-compose.yml`.
- **`AWS_*`** — S3 credentials for image uploads. Leave blank to disable uploads.
- **`FCM_*`** — Firebase service account fields. **Leave blank to disable push notifications** (the server logs a warning and skips FCM init; it doesn't crash).

The `FCM_PRIVATE_KEY` value should be the literal contents of the JSON key including `\n` escapes — they're decoded back to real newlines at runtime.

## Auth model

Two registration endpoints + one login endpoint are public:

```
POST /sessions      # log in, returns JWT
POST /users         # user signup
POST /workers       # worker signup
```

Everything else requires `Authorization: Bearer <jwt>`.

> **Note:** `SessionController.store` currently accepts a login if the email exists, **without verifying a password** (the password check is commented out in the original code, and the `User` model has no `password_hash` column). This is intentional legacy behavior — see the controller. To enable password auth properly you'll need to (1) add a migration for `password_hash`, (2) restore the `password` VIRTUAL field on the model, (3) un-comment the `checkPassword` call.

## Notes from the 2026 upgrade

This codebase was last touched ~2023. The 2026 refresh:

- Bumped Node to 22 LTS, Express 4 → 5, Sequelize 5 → 6, Multer 1 → 2, yup 0 → 1, jsonwebtoken 8 → 9, firebase-admin 9 → 13, ESLint 6 → 9 (flat config), Prettier 1 → 3.
- Replaced `aws-sdk` v2 (EOL Sep 2025) with `@aws-sdk/client-s3` v3 + `multer-s3` v3.
- Removed unused deps: `mongoose`, `firebase` (client SDK).
- **Moved the hardcoded Firebase service account** out of `src/database/index.js` into env vars. The old key is still in git history — **rotate it in the Firebase console**.
- **Fixed an auth-ordering bug**: `routes.use(authMiddleware)` was applied *after* most routes, leaving them effectively public. Now public routes are explicit and everything else is gated.
- Stubbed `MessageNotificationController.store` (was a half-finished copy-paste of `Task_Controller.store` referencing undefined locals) to a clear 501.
- Consolidated the duplicated `profile.js` / `signature.js` upload middlewares into a shared `s3Upload.js` factory.
- Removed `src/dummy/`, `src/app/dummy/`, the dead `src/websocket.js`, the broken `src/config/firebase.js`, and the leaked service account JSON.

## License

MIT.
