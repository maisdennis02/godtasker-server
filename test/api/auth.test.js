const { test, beforeEach, after } = require('node:test');
const {
  assert,
  anon,
  as,
  resetDb,
  createUser,
  closeDb,
  User,
  Task,
} = require('../support/helpers');
const { ONBOARDING_SENDER_EMAIL } = require('../../src/lib/onboarding');

beforeEach(async () => {
  await resetDb();
});
after(closeDb);

const signup = body => anon().post('/users').send(body);

test('POST /users: creates the account, never returns credentials', async () => {
  const res = await signup({
    user_name: 'dennis',
    email: 'dennis@test.local',
    password: 'password123',
    locale: 'pt-BR',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.email, 'dennis@test.local');
  assert.equal(res.body.user.user_name, 'dennis');
  assert.equal(res.body.user.locale, 'pt-BR');
  assert.equal(res.body.user.password, undefined);
  assert.equal(res.body.user.password_hash, undefined);
  assert.equal(res.body.user.notification_token, undefined);
  assert.equal(res.body.user.google_id, undefined);

  const stored = await User.findOne({ where: { email: 'dennis@test.local' } });
  assert.ok(stored.password_hash.startsWith('$2'));
  assert.notEqual(stored.password_hash, 'password123');
});

test('POST /users: validation (missing fields, short password, bad email)', async () => {
  for (const body of [
    {},
    { user_name: 'a', email: 'a@test.local' },
    { user_name: 'a', email: 'a@test.local', password: 'short' },
    { user_name: 'a', email: 'not-an-email', password: 'password123' },
    { email: 'a@test.local', password: 'password123' },
  ]) {
    const res = await signup(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error, /Schema error/);
  }
});

test('POST /users: duplicate email is rejected', async () => {
  await createUser({ email: 'dup@test.local' });
  const res = await signup({ user_name: 'x', email: 'dup@test.local', password: 'password123' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /already exists/);
});

test('POST /users: locale is capped at 16 chars and non-strings are dropped', async () => {
  const long = await signup({
    user_name: 'l',
    email: 'l@test.local',
    password: 'password123',
    locale: 'pt-BR-u-ca-gregory-nu-latn',
  });
  assert.equal(long.body.user.locale, 'pt-BR-u-ca-grego');
  const num = await signup({ user_name: 'n', email: 'n@test.local', password: 'password123', locale: 7 });
  assert.equal(num.body.user.locale, null);
});

test('POST /users: every new account gets the welcome task in its language', async () => {
  const pt = await signup({ user_name: 'p', email: 'p@test.local', password: 'password123', locale: 'pt-BR' });
  const en = await signup({ user_name: 'e', email: 'e@test.local', password: 'password123', locale: 'en-US' });
  const es = await signup({ user_name: 's', email: 's@test.local', password: 'password123', locale: 'es-AR' });

  const sender = await User.findOne({ where: { email: ONBOARDING_SENDER_EMAIL } });
  for (const [res, expectName] of [
    [pt, /^Bem-vindo ao LalaTask/],
    [en, /^Welcome to LalaTask/],
    [es, /Welcome to LalaTask .* \/ Bem-vindo ao LalaTask/],
  ]) {
    const task = await Task.findOne({ where: { assignee_id: res.body.user.id } });
    assert.ok(task, 'welcome task exists');
    assert.match(task.name, expectName);
    assert.equal(task.requester_id, sender.id);
    assert.equal(task.requester_email, sender.email);
    assert.equal(task.assignee_email, res.body.user.email);
    assert.equal(task.sub_task_list.length, 4);
    assert.equal(task.status_bar, 0);
    assert.equal(task.approval_required, false);
    assert.equal(task.confirm_photo, false);
    assert.ok(task.due_date > new Date());
  }
});

test('POST /users: the welcome task shows up in the new user\'s received list', async () => {
  const res = await signup({ user_name: 'w', email: 'w@test.local', password: 'password123', locale: 'en' });
  const me = await User.findByPk(res.body.user.id);
  const list = await as(me).get('/tasks/unfinished?nameFilter=');
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].requester.user_name, 'LalaTask');
  const count = await as(me).get('/tasks/count');
  assert.equal(count.body.countReceived, 1);
});

test('POST /users: sign-up still succeeds when the onboarding account is missing', async () => {
  await User.destroy({ where: { email: ONBOARDING_SENDER_EMAIL } });
  const res = await signup({ user_name: 'x', email: 'x@test.local', password: 'password123' });
  assert.equal(res.status, 200);
  assert.equal(await Task.count(), 0);
});

test('POST /sessions: valid credentials return the session shape', async () => {
  await createUser({ email: 'login@test.local', password: 'password123', user_name: 'login' });
  const res = await anon().post('/sessions').send({ email: 'login@test.local', password: 'password123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, 'login@test.local');
  assert.equal(res.body.user.has_password, true);
  assert.equal(res.body.user.password_hash, undefined);
  assert.equal(typeof res.body.token, 'string');

  // The token actually authenticates.
  const me = await anon()
    .get('/tasks/count')
    .set('Authorization', `Bearer ${res.body.token}`);
  assert.equal(me.status, 200);
});

test('POST /sessions: wrong password, unknown email, and Google-only account all look identical', async () => {
  await createUser({ email: 'login@test.local', password: 'password123' });
  await User.create({ email: 'google@test.local', user_name: 'g', google_id: 'g-1', points: 0 });

  const wrong = await anon().post('/sessions').send({ email: 'login@test.local', password: 'password124' });
  const unknown = await anon().post('/sessions').send({ email: 'nobody@test.local', password: 'password123' });
  const google = await anon().post('/sessions').send({ email: 'google@test.local', password: 'password123' });
  for (const res of [wrong, unknown, google]) {
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
  }
});

test('POST /sessions: validation failures are 400, not 401', async () => {
  const res = await anon().post('/sessions').send({ email: 'x', password: '1' });
  assert.equal(res.status, 400);
});

test('GET /users: excludes the onboarding account and deactivated users', async () => {
  const me = await createUser();
  await createUser({ canceled_at: new Date() });
  const res = await as(me).get('/users');
  assert.equal(res.status, 200);
  const emails = res.body.map(u => u.email);
  assert.ok(emails.includes(me.email));
  assert.ok(!emails.includes(ONBOARDING_SENDER_EMAIL));
  assert.equal(res.body.length, 1);
  for (const u of res.body) {
    assert.equal(u.password_hash, undefined);
    assert.equal(u.notification_token, undefined);
  }
});

test('GET /users/:id: profile never exposes push token or credentials', async () => {
  const me = await createUser();
  const other = await createUser({ notification_token: 'fcm-secret', hint: 'h' });
  const res = await as(me).get(`/users/${other.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, other.id);
  assert.equal(res.body.notification_token, undefined);
  assert.equal(res.body.password_hash, undefined);
  assert.equal(res.body.password_reset_hash, undefined);
});
