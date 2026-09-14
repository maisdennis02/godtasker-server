const { test, before, after } = require('node:test');
const {
  assert,
  anon,
  as,
  resetDb,
  createUser,
  closeDb,
  request,
  app,
} = require('../support/helpers');

before(async () => {
  await resetDb();
});
after(closeDb);

test('GET /health is public and answers ok', async () => {
  const res = await anon().get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('auth gate: protected routes reject a missing token', async () => {
  const res = await anon().get('/tasks/count');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Token not provided');
});

test('auth gate: protected routes reject a forged token', async () => {
  const res = await request(app)
    .get('/tasks/count')
    .set('Authorization', 'Bearer not.a.jwt');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid token');
});

test('auth gate: a token signed with another secret is rejected', async () => {
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign({ id: 1 }, 'wrong-secret', { algorithm: 'HS256' });
  const res = await request(app)
    .get('/tasks/count')
    .set('Authorization', `Bearer ${forged}`);
  assert.equal(res.status, 401);
});

test('auth gate: a token using alg=none is rejected', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ id: 1 })).toString('base64url');
  const res = await request(app)
    .get('/tasks/count')
    .set('Authorization', `Bearer ${header}.${payload}.`);
  assert.equal(res.status, 401);
});

test('auth gate: a valid token gets through', async () => {
  const user = await createUser();
  const res = await as(user).get('/tasks/count');
  assert.equal(res.status, 200);
  assert.equal(res.body.countReceived, 0);
});
