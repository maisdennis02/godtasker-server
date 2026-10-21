// The welcome tasks arrive one at a time: finishing step N delivers step N+1
// (with a push), and the fourth is the last. Driven through the real API, the
// way any app version — including ones without the onboarding UI — uses it.
const { test, beforeEach, after } = require('node:test');
const { assert, anon, as, resetDb, closeDb, stubs, flush, User, Task } = require('../support/helpers');
const Signature = require('../../src/app/models/Signature').default;

beforeEach(async () => {
  await resetDb();
});
after(closeDb);

async function signUp(overrides = {}) {
  const res = await anon()
    .post('/users')
    .send({ user_name: 'newbie', email: 'newbie@test.local', password: 'password123', locale: 'en-US', ...overrides });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const user = await User.findByPk(res.body.user.id);
  await user.update({ notification_token: 'newbie-token' });
  return user;
}

const welcome = (user, step) => Task.findOne({ where: { assignee_id: user.id, onboarding_step: step } });

// Tick every subtask (the toggle endpoint is covered elsewhere), attach a
// proof photo when the task demands one, then confirm.
async function finish(user, task) {
  const ticked = task.sub_task_list.map(s => ({ ...s, complete: true }));
  await Task.update({ sub_task_list: ticked, status_bar: 100 }, { where: { id: task.id } });
  const body = task.confirm_photo
    ? { signature_id: (await Signature.create({ name: 'proof.jpg', path: 'https://x/proof.jpg' })).id }
    : {};
  return as(user).put(`/tasks/confirm/${task.id}`).send(body);
}

test('completing step 1 sends step 2 with a push', async () => {
  const user = await signUp();
  const res = await finish(user, await welcome(user, 1));
  assert.equal(res.status, 200);
  await flush();

  const step2 = await welcome(user, 2);
  assert.ok(step2, 'step 2 delivered');
  assert.equal(step2.name, '3-day challenge: a photo of your day');
  assert.equal(step2.points, 30);
  assert.equal(step2.confirm_photo, true);
  const days = (new Date(step2.due_date) - new Date(step2.start_date)) / 86400000;
  assert.ok(Math.abs(days - 3) < 0.01, `3-day window, got ${days}`);
  assert.ok(stubs.fcm.sent.some(m => m.token === 'newbie-token' && /3-day challenge/.test(m.notification.body)));
  assert.equal((await user.reload()).points, 10);
});

test('step 3 is the Sunday reset with a week to do it', async () => {
  const user = await signUp();
  for (const step of [1, 2]) {
    assert.equal((await finish(user, await welcome(user, step))).status, 200);
    await flush();
  }
  const step3 = await welcome(user, 3);
  assert.ok(step3, 'step 3 delivered');
  assert.equal(step3.name, 'Sunday reset (30 min)');
  assert.equal(step3.confirm_photo, false);
  const days = (new Date(step3.due_date) - new Date(step3.start_date)) / 86400000;
  assert.ok(Math.abs(days - 7) < 0.01, `7-day window, got ${days}`);
});

test('the photo challenge cannot be ended without a photo', async () => {
  const user = await signUp();
  assert.equal((await finish(user, await welcome(user, 1))).status, 200);
  await flush();
  const step2 = await welcome(user, 2);
  const ticked = step2.sub_task_list.map(s => ({ ...s, complete: true }));
  await Task.update({ sub_task_list: ticked, status_bar: 100 }, { where: { id: step2.id } });
  const res = await as(user).put(`/tasks/confirm/${step2.id}`).send({});
  assert.equal(res.status, 400);
  assert.match(res.body.error, /photo/);
  await flush();
  assert.equal(await welcome(user, 3), null);
});

test('completing step 4 sends nothing more', async () => {
  const user = await signUp({ locale: 'pt-BR' });
  for (const step of [1, 2, 3, 4]) {
    const task = await welcome(user, step);
    assert.ok(task, `step ${step} exists`);
    assert.equal((await finish(user, task)).status, 200);
    await flush();
  }
  assert.equal(await Task.count({ where: { assignee_id: user.id } }), 4);
  assert.equal((await user.reload()).points, 100);
});

test('concurrent confirms create one step 2', async () => {
  const user = await signUp();
  const step1 = await welcome(user, 1);
  const ticked = step1.sub_task_list.map(s => ({ ...s, complete: true }));
  await Task.update({ sub_task_list: ticked }, { where: { id: step1.id } });
  await Promise.all([
    as(user).put(`/tasks/confirm/${step1.id}`).send({}),
    as(user).put(`/tasks/confirm/${step1.id}`).send({}),
  ]);
  await flush();
  assert.equal(await Task.count({ where: { assignee_id: user.id, onboarding_step: 2 } }), 1);
  assert.equal((await user.reload()).points, 10);
});

test('canceled welcome task does not advance', async () => {
  const user = await signUp();
  const step1 = await welcome(user, 1);
  await step1.update({ canceled_at: new Date() });
  const res = await finish(user, step1);
  assert.equal(res.status, 400);
  await flush();
  assert.equal(await welcome(user, 2), null);
  assert.equal((await user.reload()).points ?? 0, 0);
});
