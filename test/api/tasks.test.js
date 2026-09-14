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

let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice', locale: 'en-US' });
  bob = await createUser({ user_name: 'bob', locale: 'pt-BR', notification_token: 'bob-token' });
});
after(closeDb);

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const twoDays = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString();

test('POST /tasks: creates the task, computes progress, pushes to the assignee in their language', async () => {
  const res = await as(alice)
    .post('/tasks')
    .send({
      assignee_email: bob.email,
      name: 'Wash the car',
      description: 'Please',
      sub_task_list: [
        { description: 'a', complete: true, order: 0 },
        { description: 'b', complete: false, order: 1 },
      ],
      points: 5,
      start_date: tomorrow(),
      due_date: twoDays(),
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.requester_id, alice.id);
  assert.equal(res.body.requester_email, alice.email);
  assert.equal(res.body.assignee_id, bob.id);
  assert.equal(res.body.assignee_email, bob.email);
  assert.equal(res.body.status_bar, 50);
  assert.equal(res.body.approval_required, false);

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  const push = stubs.fcm.sent[0];
  assert.equal(push.token, 'bob-token');
  assert.equal(push.notification.title, 'alice');
  assert.match(push.notification.body, /^Nova tarefa: Wash the car \| prazo \d{2}\/\d{2}\/\d{4}$/);
  assert.equal(push.data.channelId, 'godtaskerChannel01');
  assert.equal(push.data.message, push.notification.body);
});

test('POST /tasks: the requester id comes from the token, not the body', async () => {
  const res = await as(alice)
    .post('/tasks')
    .send({ assignee_email: bob.email, name: 'x', requester_id: bob.id, requester_email: bob.email });
  assert.equal(res.status, 200);
  assert.equal(res.body.requester_id, alice.id);
});

test('POST /tasks: English recipient gets English copy; no token means no push', async () => {
  await alice.update({ notification_token: 'alice-token' });
  const res = await as(bob).post('/tasks').send({ assignee_email: alice.email, name: 'Dishes' });
  assert.equal(res.status, 200);
  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  assert.equal(stubs.fcm.sent[0].notification.body, 'New task: Dishes');

  stubs.fcm.sent.length = 0;
  await alice.update({ notification_token: null });
  await as(bob).post('/tasks').send({ assignee_email: alice.email, name: 'Dishes 2' });
  await flush();
  assert.equal(stubs.fcm.sent.length, 0);
});

test('POST /tasks: unknown assignee is 400', async () => {
  const res = await as(alice).post('/tasks').send({ assignee_email: 'ghost@test.local', name: 'x' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Assignee does not exist/);
});

test('POST /tasks: blocked either way is 403', async () => {
  await bob.update({ blocked_list: [alice.email] });
  const blockedByTarget = await as(alice).post('/tasks').send({ assignee_email: bob.email, name: 'x' });
  assert.equal(blockedByTarget.status, 403);
  const blockedByMe = await as(bob).post('/tasks').send({ assignee_email: alice.email, name: 'x' });
  assert.equal(blockedByMe.status, 403);
  assert.equal(await Task.count(), 0);
});

test('POST /tasks: empty date strings from the mobile pickers are stored as null (regression: 500)', async () => {
  const res = await as(alice)
    .post('/tasks')
    .send({ assignee_email: bob.email, name: 'No dates', start_date: '', due_date: '' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.start_date, null);
  assert.equal(res.body.due_date, null);
  await flush();
  assert.equal(stubs.fcm.sent[0].notification.body, 'Nova tarefa: No dates');
});

test('POST /tasks: start dates more than a day in the past are refused', async () => {
  const past = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const res = await as(alice).post('/tasks').send({ assignee_email: bob.email, name: 'x', start_date: past });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Past dates/);
  // A few hours ago is still fine (timezone slack).
  const recent = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const ok = await as(alice).post('/tasks').send({ assignee_email: bob.email, name: 'x', start_date: recent });
  assert.equal(ok.status, 200);
});

test('lists: sent vs received, unfinished vs finished vs canceled, scoped to the caller', async () => {
  const carol = await createUser({ user_name: 'carol' });
  const open = await createTask(alice, bob, { name: 'open', due_date: twoDays() });
  const soon = await createTask(alice, bob, { name: 'soon', due_date: tomorrow() });
  await createTask(alice, bob, { name: 'done', end_date: new Date() });
  await createTask(alice, bob, { name: 'gone', canceled_at: new Date() });
  await createTask(carol, bob, { name: 'from carol' });
  await createTask(bob, alice, { name: 'to alice' });

  const received = await as(bob).get('/tasks/unfinished?nameFilter=');
  // Ordered by due_date ascending (NULL last); each row carries both parties.
  assert.deepEqual(received.body.map(t => t.name), ['soon', 'open', 'from carol']);
  assert.equal(received.body[0].id, soon.id);
  assert.equal(received.body[1].id, open.id);
  assert.equal(received.body[0].requester.user_name, 'alice');
  assert.equal(received.body[0].assignee.user_name, 'bob');

  const sent = await as(alice).get('/tasks/user/unfinished?nameFilter=&assigneeNameFilter=');
  assert.deepEqual(sent.body.map(t => t.name).sort(), ['open', 'soon']);

  const sentFiltered = await as(alice).get('/tasks/user/unfinished?nameFilter=op&assigneeNameFilter=');
  assert.deepEqual(sentFiltered.body.map(t => t.name), ['open']);

  const finished = await as(bob).get('/tasks/finished?nameFilter=');
  assert.deepEqual(finished.body.map(t => t.name), ['done']);
  const finishedSent = await as(alice).get('/tasks/user/finished?nameFilter=&assigneeNameFilter=');
  assert.deepEqual(finishedSent.body.map(t => t.name), ['done']);

  const canceled = await as(bob).get('/tasks/canceled?nameFilter=');
  assert.deepEqual(canceled.body.map(t => t.name), ['gone']);

  // Carol sees only her own.
  const carolSent = await as(carol).get('/tasks/user/unfinished?nameFilter=&assigneeNameFilter=');
  assert.deepEqual(carolSent.body.map(t => t.name), ['from carol']);
  const carolReceived = await as(carol).get('/tasks/unfinished?nameFilter=');
  assert.equal(carolReceived.body.length, 0);
});

test('lists: name filter is case-insensitive', async () => {
  await createTask(alice, bob, { name: 'Lavar Louça' });
  const res = await as(bob).get('/tasks/unfinished?nameFilter=louça');
  assert.equal(res.body.length, 1);
});

test('finished list: opt-in pagination via limit/page, newest first', async () => {
  for (let i = 0; i < 5; i += 1) {
    await createTask(alice, bob, { name: `t${i}`, end_date: new Date(Date.now() - i * 1000) });
  }
  const all = await as(bob).get('/tasks/finished?nameFilter=');
  assert.equal(all.body.length, 5);
  assert.equal(all.body[0].name, 't0');
  const p1 = await as(bob).get('/tasks/finished?nameFilter=&limit=2&page=1');
  assert.deepEqual(p1.body.map(t => t.name), ['t0', 't1']);
  const p3 = await as(bob).get('/tasks/finished?nameFilter=&limit=2&page=3');
  assert.deepEqual(p3.body.map(t => t.name), ['t4']);
  const bogus = await as(bob).get('/tasks/finished?nameFilter=&limit=abc&page=-1');
  assert.equal(bogus.body.length, 5);
});

test('counts: received / sent / initiated / finished / canceled / overdue', async () => {
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  await createTask(alice, bob, { name: 'new' });
  await createTask(alice, bob, { name: 'started', initiated_at: new Date(), due_date: twoDays() });
  await createTask(alice, bob, { name: 'late', initiated_at: new Date(), due_date: yesterday });
  await createTask(alice, bob, { name: 'done', end_date: new Date() });
  await createTask(alice, bob, { name: 'gone', canceled_at: new Date() });

  const bobCount = await as(bob).get('/tasks/count');
  assert.equal(bobCount.body.countReceived, 1);
  assert.equal(bobCount.body.countInitiated, 2);
  assert.equal(bobCount.body.countFinished, 1);
  assert.equal(bobCount.body.countCanceled, 1);
  assert.equal(bobCount.body.countOverDue, 1);

  const aliceCount = await as(alice).get('/tasks/user/count');
  assert.equal(aliceCount.body.countSent, 1);
  assert.equal(aliceCount.body.countInitiated, 2);
  assert.equal(aliceCount.body.countFinished, 1);
  assert.equal(aliceCount.body.countCanceled, 1);

  // Alice received nothing.
  const aliceReceived = await as(alice).get('/tasks/count');
  assert.equal(aliceReceived.body.countReceived, 0);
});

test('PUT /tasks/:id: recomputes progress from subtasks and keeps due locked to a fixed duration', async () => {
  const start = new Date('2030-01-01T10:00:00Z');
  const task = await createTask(alice, bob, {
    name: 'fixed',
    duration_minutes: 90,
    start_date: start,
    due_date: new Date(start.getTime() + 90 * 60000),
  });
  const res = await as(alice)
    .put(`/tasks/${task.id}`)
    .send({
      name: 'renamed',
      sub_task_list: [{ complete: true }, { complete: true }, { complete: false }, { complete: false }],
      start_date: '2030-01-01T12:00:00Z',
      due_date: '2030-12-31T00:00:00Z',
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.name, 'renamed');
  assert.equal(res.body.status_bar, 50);
  assert.equal(new Date(res.body.due_date).toISOString(), '2030-01-01T13:30:00.000Z');

  const missing = await as(alice).put('/tasks/999999').send({ name: 'x' });
  assert.equal(missing.status, 404);
});

test('PUT /tasks/:id: empty date strings clear the date instead of 500ing', async () => {
  const task = await createTask(alice, bob, { due_date: twoDays() });
  const res = await as(alice).put(`/tasks/${task.id}`).send({ due_date: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.due_date, null);
});

test('DELETE /tasks/:id removes the task', async () => {
  const task = await createTask(alice, bob);
  const res = await as(alice).delete(`/tasks/${task.id}`);
  assert.equal(res.status, 200);
  assert.equal(await Task.findByPk(task.id), null);
  assert.equal((await as(alice).delete(`/tasks/${task.id}`)).status, 404);
});
