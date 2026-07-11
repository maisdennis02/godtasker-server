---
name: verify
description: Build/launch/drive recipe for verifying godTaskerServer changes end-to-end against the local Docker Postgres.
---

# Verifying godTaskerServer changes

## Gotchas (read first)

- **`.env` has `DATABASE_URL` pointing at PROD Neon**, and it takes
  precedence over `DB_*` in `src/config/database.js`. Always unset it
  for local runs and migrations: `DATABASE_URL= <command>`.
- Local Postgres runs in Docker: container `godtasker-postgres`
  (postgres:17-alpine, port 5432, user `postgres`, db `godtasker`).
  Check with `docker compose ps`.
- No `RESEND_API_KEY` locally → `src/lib/mail.js` logs the email body
  (including reset codes) to stdout instead of sending.

## Launch

```bash
cd godTaskerServer1-2
DATABASE_URL= npx sequelize db:migrate          # local migrations
DATABASE_URL= PORT=3456 node -r sucrase/register src/server.js > /tmp/server.log 2>&1 &
curl -s http://localhost:3456/health            # {"status":"ok"} when up (takes ~5s)
```

Use a non-default PORT to avoid clashing with a dev server the user
may have running on 3333.

## Drive

- Public endpoints: `POST /sessions` (login), `POST /users` (register),
  `POST /password/forgot`, `POST /password/reset`. Everything else
  needs `Authorization: Bearer <token>` from the login response.
- Create a throwaway user for flows that mutate state
  (`{user_name, email, password}` — password min 8), then delete it:
  `docker exec godtasker-postgres psql -U postgres -d godtasker -c "DELETE FROM users WHERE email = '...';"`
- Auth endpoints are rate-limited to 20 req / 15 min per IP
  (`authLimiter`) — budget probes accordingly.
- SQL is echoed to stdout in dev; grep the log for emails/codes.
