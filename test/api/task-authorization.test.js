// Every task mutation must be limited to the two people on the task. A third
// authenticated user (any tester with an account) must get 403 and leave the
// row untouched.
const { test, beforeEach, after } = require('node:test');
const {
  assert,
  as,
  resetDb,
  createUser,
  createTask,
  closeDb,
  Task,
} = require('../support/helpers');

let alice;
let bob;
let mallory;
let task;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice' });
  bob = await createUser({ user_name: 'bob' });
  mallory = await createUser({ user_name: 'mallory' });
  task = await createTask(alice, bob, {
    name: 'private',
    sub_task_list: [{ description: 'a', complete: true }],
  });
});
after(closeDb);

const unchanged = async () => {
  const fresh = await Task.findByPk(task.id);
  assert.ok(fresh, 'task still exists');
  assert.equal(fresh.name, 'private');
  assert.equal(fresh.canceled_at, null);
  assert.equal(fresh.end_date, null);
  return fresh;
};

const cases = [
  ['PUT /tasks/:id (edit)', () => as(mallory).put(`/tasks/${task.id}`).send({ name: 'hacked' })],
  ['DELETE /tasks/:id', () => as(mallory).delete(`/tasks/${task.id}`)],
  ['PUT /tasks/:id/cancel', () => as(mallory).put(`/tasks/${task.id}/cancel`).send({ status: { comment: 'x' } })],
  ['PUT /tasks/:id/revive', () => as(mallory).put(`/tasks/${task.id}/revive`).send({})],
  ['PUT /tasks/:id/status', () => as(mallory).put(`/tasks/${task.id}/status`).send({ name: 'hacked' })],
  [
    'PUT /tasks/:id/notification/worker',
    () => as(mallory).put(`/tasks/${task.id}/notification/worker`).send({ name: 'hacked', initiated_at: new Date() }),
  ],
  [
    'PUT /tasks/:id/notification/worker/subtask',
    () =>
      as(mallory)
        .put(`/tasks/${task.id}/notification/worker/subtask`)
        .send({ name: 'hacked', sub_task_list: [], position: 0 }),
  ],
  ['PUT /tasks/confirm/:id', () => as(mallory).put(`/tasks/confirm/${task.id}`).send({})],
  ['PUT /tasks/:id/approve', () => as(mallory).put(`/tasks/${task.id}/approve`).send({})],
  ['PUT /tasks/:id/reopen', () => as(mallory).put(`/tasks/${task.id}/reopen`).send({ feedback: 'x' })],
];

for (const [name, call] of cases) {
  test(`${name}: a third party gets 403 and nothing changes`, async () => {
    const res = await call();
    assert.equal(res.status, 403, `${name} → ${res.status} ${JSON.stringify(res.body)}`);
    await unchanged();
  });
}

test('GET /tasks/:id/details: a third party cannot read someone else\'s task', async () => {
  const res = await as(mallory).get(`/tasks/${task.id}/details`);
  assert.equal(res.status, 403, JSON.stringify(res.body));
  const own = await as(bob).get(`/tasks/${task.id}/details`);
  assert.equal(own.status, 200);
  assert.equal(own.body[0].id, task.id);
});

test('participants keep full access: requester edits, assignee starts, either deletes', async () => {
  const edit = await as(alice).put(`/tasks/${task.id}`).send({ description: 'edited' });
  assert.equal(edit.status, 200);
  const start = await as(bob).put(`/tasks/${task.id}/notification/worker`).send({ initiated_at: new Date() });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const status = await as(bob).put(`/tasks/${task.id}/status`).send({ status_bar: 10 });
  assert.equal(status.status, 200);
  const cancel = await as(alice).put(`/tasks/${task.id}/cancel`).send({});
  assert.equal(cancel.status, 200);
  const revive = await as(alice).put(`/tasks/${task.id}/revive`).send({});
  assert.equal(revive.status, 200);
  const del = await as(bob).delete(`/tasks/${task.id}`);
  assert.equal(del.status, 200);
});

test('unknown task ids are 404 on every mutation, never 500', async () => {
  const id = 999999;
  const calls = [
    as(alice).put(`/tasks/${id}`).send({}),
    as(alice).delete(`/tasks/${id}`),
    as(alice).put(`/tasks/${id}/cancel`).send({}),
    as(alice).put(`/tasks/${id}/revive`).send({}),
    as(alice).put(`/tasks/${id}/status`).send({}),
    as(alice).put(`/tasks/${id}/notification/worker`).send({}),
    as(alice).put(`/tasks/${id}/notification/worker/subtask`).send({ sub_task_list: [] }),
    as(alice).put(`/tasks/confirm/${id}`).send({}),
    as(alice).put(`/tasks/${id}/approve`).send({}),
    as(alice).put(`/tasks/${id}/reopen`).send({ feedback: 'x' }),
    as(alice).get(`/tasks/${id}/details`),
  ];
  const results = await Promise.all(calls);
  results.forEach((res, i) => assert.equal(res.status, 404, `call #${i} → ${res.status}`));
});
