// Preloaded by `npm test` (node --require) before anything else, so these
// values win over the dotenv file: dotenv never overrides a key that already
// exists in process.env. The point is to make it IMPOSSIBLE for the suite to
// touch the production database or send real pushes/emails, whatever the
// dotenv file says.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL || 'silent';

// Database: local test Postgres only (see test/support/db.js for the guard).
process.env.DATABASE_URL = '';
process.env.DB_SSL = 'false';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5433';
process.env.DB_USER = process.env.TEST_DB_USER || 'postgres';
process.env.DB_PASS = process.env.TEST_DB_PASS || 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'godtasker_test';
process.env.DB_POOL_MAX = '5';

process.env.APP_SECRET = 'test-secret-not-for-prod';

// Outbound integrations off: firebase-admin stays uninitialised (the stub in
// stubs.js captures pushes), Resend is disabled, S3 creds are empty.
process.env.FCM_PROJECT_ID = '';
process.env.FCM_PRIVATE_KEY = '';
process.env.FCM_CLIENT_EMAIL = '';
process.env.RESEND_API_KEY = '';
process.env.AWS_KEY_ID = '';
process.env.AWS_SECRET_ACCESS_KEY = '';
process.env.AWS_REGION = 'us-east-2';
process.env.AWS_BUCKET = 'test-bucket';
process.env.RENDER_EXTERNAL_URL = '';
process.env.APP_URL = 'http://localhost:3333';
process.env.GOOGLE_CLIENT_IDS = process.env.GOOGLE_CLIENT_IDS_TEST || '';
process.env.ONBOARDING_SENDER_EMAIL = 'onboarding@lalatask.com';

// Rate limits are per-process; the suite would trip the 20/15min auth limiter
// in seconds. ratelimit.test.js lowers these again on purpose.
process.env.AUTH_RATE_LIMIT = process.env.AUTH_RATE_LIMIT || '100000';
process.env.API_RATE_LIMIT = process.env.API_RATE_LIMIT || '1000000';

require('sucrase/register');
require('./stubs');
