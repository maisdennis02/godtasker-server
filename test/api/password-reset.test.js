const { test, beforeEach, after } = require('node:test');
const {
  assert,
  anon,
  resetDb,
  createUser,
  closeDb,
  stubs,
  User,
} = require('../support/helpers');

beforeEach(async () => {
  await resetDb();
});
after(closeDb);

const forgot = email => anon().post('/password/forgot').send({ email });
const reset = body => anon().post('/password/reset').send(body);
const login = (email, password) => anon().post('/sessions').send({ email, password });

const lastCode = () => {
  const msg = stubs.mail.sent[stubs.mail.sent.length - 1];
  return msg.text.match(/code is: (\d{6})/)[1];
};

test('forgot: same reply whether or not the email exists; mail only for real accounts', async () => {
  await createUser({ email: 'real@test.local' });
  const known = await forgot('real@test.local');
  const unknown = await forgot('ghost@test.local');
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(stubs.mail.sent.length, 1);
  assert.equal(stubs.mail.sent[0].to, 'real@test.local');
  assert.match(stubs.mail.sent[0].text, /\d{6}/);

  const user = await User.findOne({ where: { email: 'real@test.local' } });
  assert.ok(user.password_reset_hash);
  assert.notEqual(user.password_reset_hash, lastCode());
  assert.ok(user.password_reset_expires > new Date());
  assert.equal(user.password_reset_attempts, 0);
});

test('forgot: a mail provider failure still returns the generic reply', async () => {
  await createUser({ email: 'real@test.local' });
  stubs.mail.failNext = new Error('Resend: boom');
  const res = await forgot('real@test.local');
  assert.equal(res.status, 200);
});

test('forgot: validation', async () => {
  assert.equal((await forgot('nope')).status, 400);
  assert.equal((await anon().post('/password/forgot').send({})).status, 400);
});

test('reset: the emailed code sets a new password, is single-use, and old password stops working', async () => {
  await createUser({ email: 'real@test.local', password: 'oldpassword' });
  await forgot('real@test.local');
  const code = lastCode();

  const ok = await reset({ email: 'real@test.local', code, password: 'newpassword1' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  assert.equal((await login('real@test.local', 'newpassword1')).status, 200);
  assert.equal((await login('real@test.local', 'oldpassword')).status, 401);

  const again = await reset({ email: 'real@test.local', code, password: 'another123' });
  assert.equal(again.status, 401);
  const user = await User.findOne({ where: { email: 'real@test.local' } });
  assert.equal(user.password_reset_hash, null);
  assert.equal(user.password_reset_expires, null);
});

test('reset: wrong code is 401, counts an attempt, and locks after 5', async () => {
  await createUser({ email: 'real@test.local', password: 'oldpassword' });
  await forgot('real@test.local');
  const code = lastCode();
  const wrong = code === '000000' ? '000001' : '000000';

  for (let i = 1; i <= 5; i += 1) {
    const res = await reset({ email: 'real@test.local', code: wrong, password: 'newpassword1' });
    assert.equal(res.status, 401);
    const user = await User.findOne({ where: { email: 'real@test.local' } });
    assert.equal(user.password_reset_attempts, i);
  }
  // Even the right code is refused now.
  const locked = await reset({ email: 'real@test.local', code, password: 'newpassword1' });
  assert.equal(locked.status, 401);
  assert.equal((await login('real@test.local', 'oldpassword')).status, 200);
});

test('reset: an expired code is refused', async () => {
  const user = await createUser({ email: 'real@test.local' });
  await forgot('real@test.local');
  const code = lastCode();
  await user.update({ password_reset_expires: new Date(Date.now() - 1000) });
  const res = await reset({ email: 'real@test.local', code, password: 'newpassword1' });
  assert.equal(res.status, 401);
});

test('reset: a fresh forgot invalidates the previous code', async () => {
  await createUser({ email: 'real@test.local' });
  await forgot('real@test.local');
  const first = lastCode();
  await forgot('real@test.local');
  const second = lastCode();
  if (first !== second) {
    const res = await reset({ email: 'real@test.local', code: first, password: 'newpassword1' });
    assert.equal(res.status, 401);
  }
  const res = await reset({ email: 'real@test.local', code: second, password: 'newpassword1' });
  assert.equal(res.status, 200);
});

test('reset: validation (code shape, password length, unknown user)', async () => {
  assert.equal((await reset({ email: 'x@test.local', code: '12345', password: 'newpassword1' })).status, 400);
  assert.equal((await reset({ email: 'x@test.local', code: 'abcdef', password: 'newpassword1' })).status, 400);
  assert.equal((await reset({ email: 'x@test.local', code: '123456', password: 'short' })).status, 400);
  assert.equal((await reset({ email: 'ghost@test.local', code: '123456', password: 'newpassword1' })).status, 401);
});

test('reset: a Google-only account can set its first password this way', async () => {
  await User.create({ email: 'g@test.local', user_name: 'g', google_id: 'sub', points: 0 });
  await forgot('g@test.local');
  const res = await reset({ email: 'g@test.local', code: lastCode(), password: 'newpassword1' });
  assert.equal(res.status, 200);
  const session = await login('g@test.local', 'newpassword1');
  assert.equal(session.status, 200);
  assert.equal(session.body.user.has_password, true);
});
