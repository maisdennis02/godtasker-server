# GodTasker backend — production image.
# Express 5 + Socket.io (persistent WebSocket) → runs as an always-on service.
FROM node:22-alpine

WORKDIR /app

# Install ALL deps: sucrase (build) and sequelize-cli (migrations) are
# devDependencies but both are needed inside the image.
COPY package*.json ./
RUN npm ci

COPY . .

# Transpile src/ → dist/ (sucrase, imports transform).
RUN npm run build

ENV NODE_ENV=production
# The host injects PORT; the app falls back to 3333 if unset.
EXPOSE 3333

# Run pending migrations, then boot. Single instance → safe to migrate here.
CMD ["sh", "-c", "npm run db:migrate && node dist/server.js"]
