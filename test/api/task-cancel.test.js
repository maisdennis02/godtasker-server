const { test, beforeEach, after } = require('node:test');
const {
  assert,
  as,
  resetDb,
  createUser,
  createTask,
  closeDb,
  stubs,
  flush,
  Task,
} = require('../support/helpers');
const Offering = require('../../src/app/models/Offering').default;

let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice', locale: 'en-US' });
  bob = await createUser({ user_name: 'bob', locale: 'pt-BR', notification_token: 'bob-token' });
});
after(closeDb);

test('PUT /tasks/:id/cancel: the requester cancels an in-progress task and the assignee is told in their language', async () => {
  const task = await createTask(alice, bob, { name: 'Paint fence', initiated_at: new Date() });
  const res = await as(alice).put(`/tasks/${task.id}/cancel`).send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.canceled_at);

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  const push = stubs.fcm.sent[0];
  assert.equal(push.token, 'bob-token');
  assert.equal(push.notification.title, 'alice');
  assert.equal(push.notification.body, '"Paint fence" foi cancelada');
  assert.equal(push.data.message, push.notification.body);
});

test('PUT /tasks/:id/cancel: the assignee cannot cancel', async () => {
  const task = await createTask(alice, bob);
  const res = await as(bob).put(`/tasks/${task.id}/cancel`).send({});
  assert.equal(res.status, 403);
  assert.equal((await Task.findByPk(task.id)).canceled_at, null);
});

test('PUT /tasks/:id/cancel: finished or already canceled tasks stay as they are', async () => {
  const done = await createTask(alice, bob, { end_date: new Date() });
  const canceledAt = new Date(Date.now() - 3600 * 1000);
  const canceled = await createTask(alice, bob, { canceled_at: canceledAt });

  assert.equal((await as(alice).put(`/tasks/${done.id}/cancel`).send({})).status, 409);
  assert.equal((await as(alice).put(`/tasks/${canceled.id}/cancel`).send({})).status, 409);
  assert.equal((await Task.findByPk(done.id)).canceled_at, null);
  assert.equal((await Task.findByPk(canceled.id)).canceled_at.getTime(), canceledAt.getTime());
  await flush();
  assert.equal(stubs.fcm.sent.length, 0);
});

test('PUT /tasks/:id/cancel: offering tasks cannot be canceled', async () => {
  const offering = await Offering.create({ creator_id: bob.id, name: 'Haircut' });
  const task = await createTask(alice, bob, { offering_id: offering.id });
  const res = await as(alice).put(`/tasks/${task.id}/cancel`).send({});
  assert.equal(res.status, 409);
  assert.equal((await Task.findByPk(task.id)).canceled_at, null);
});
