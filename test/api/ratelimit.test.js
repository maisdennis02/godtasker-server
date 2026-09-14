// Own process: the limiters are built once at module load from these values.
process.env.AUTH_RATE_LIMIT = '3';
process.env.API_RATE_LIMIT = '1000';

const { test, before, after } = require('node:test');
const { assert, anon, resetDb, closeDb } = require('../support/helpers');

before(async () => {
  await resetDb();
});
after(closeDb);

test('auth endpoints: the 4th attempt from one IP inside the window is 429', async () => {
  const attempt = () => anon().post('/sessions').send({ email: 'x@test.local', password: 'password123' });
  for (let i = 0; i < 3; i += 1) {
    const res = await attempt();
    assert.equal(res.status, 401, `attempt ${i + 1}`);
    assert.ok(res.headers['ratelimit'] || res.headers['ratelimit-limit'], 'standard headers present');
  }
  const blocked = await attempt();
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many attempts/);
  // Sign-up shares the same bucket.
  const signup = await anon().post('/users').send({ user_name: 'a', email: 'a@test.local', password: 'password123' });
  assert.equal(signup.status, 429);
});

test('the auth limiter does not throttle unrelated public routes', async () => {
  const res = await anon().get('/health');
  assert.equal(res.status, 200);
});

test('the limiter keys on the proxied client IP (trust proxy = 1)', async () => {
  const fresh = await anon()
    .post('/sessions')
    .set('X-Forwarded-For', '203.0.113.7')
    .send({ email: 'x@test.local', password: 'password123' });
  assert.equal(fresh.status, 401);
});
