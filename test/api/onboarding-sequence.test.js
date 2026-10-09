// The welcome tasks arrive one at a time: finishing step N delivers step N+1
// (with a push), and the third is the last. Driven through the real API, the
// way any app version — including ones without the onboarding UI — uses it.
const { test, beforeEach, after } = require('node:test');
const { assert, anon, as, resetDb, closeDb, stubs, flush, User, Task } = require('../support/helpers');

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

// Tick every subtask (the toggle endpoint is covered elsewhere), then confirm.
async function finish(user, task) {
  const ticked = task.sub_task_list.map(s => ({ ...s, complete: true }));
  await Task.update({ sub_task_list: ticked, status_bar: 100 }, { where: { id: task.id } });
  return as(user).put(`/tasks/confirm/${task.id}`).send({});
}

test('completing step 1 sends step 2 with a push', async () => {
  const user = await signUp();
  const res = await finish(user, await welcome(user, 1));
  assert.equal(res.status, 200);
  await flush();

  const step2 = await welcome(user, 2);
  assert.ok(step2, 'step 2 delivered');
  assert.equal(step2.name, 'Organize something of yours');
  assert.equal(step2.points, 20);
  assert.ok(stubs.fcm.sent.some(m => m.token === 'newbie-token' && /Organize something of yours/.test(m.notification.body)));
  assert.equal((await user.reload()).points, 10);
});

test('completing step 3 sends nothing more', async () => {
  const user = await signUp({ locale: 'pt-BR' });
  for (const step of [1, 2, 3]) {
    const task = await welcome(user, step);
    assert.ok(task, `step ${step} exists`);
    assert.equal((await finish(user, task)).status, 200);
    await flush();
  }
  assert.equal(await Task.count({ where: { assignee_id: user.id } }), 3);
  assert.equal((await user.reload()).points, 60);
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
