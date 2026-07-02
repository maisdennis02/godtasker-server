require('dotenv').config();

// Managed Postgres (Render/Railway/Neon/RDS) hands you a single connection
// URL and requires TLS. Local dev keeps using the individual DB_* vars with
// no SSL. Both this file's consumers — the runtime (src/database/index.js)
// and sequelize-cli (migrations) — read this same config.
const usingUrl = !!process.env.DATABASE_URL;
const sslEnabled = process.env.DB_SSL === 'true' || usingUrl;

function fromUrl(connectionString) {
  const u = new URL(connectionString);
  return {
    host: u.hostname,
    port: u.port || 5432,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

module.exports = {
  dialect: 'postgres',
  ...(usingUrl
    ? fromUrl(process.env.DATABASE_URL)
    : {
        host: process.env.DB_HOST,
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
      }),
  define: {
    timestamps: true,
    underscored: true,
    underscoredAll: true,
  },
  // Managed Postgres tiers cap total connections low; keep the pool small so a
  // traffic spike can't exhaust the server's connection limit.
  pool: {
    max: Number(process.env.DB_POOL_MAX) || 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  // Providers use certs that don't chain to a public root; require TLS but
  // don't reject the self-signed chain (standard for Render/Heroku/RDS).
  ...(sslEnabled
    ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } }
    : {}),
};
