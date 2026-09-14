// Completion → approval → reopen → cancel/revive, including who gets which
// push in which language. The push side regressed in prod before (wrong
// target on confirm), so every step asserts the recipient token.
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
const Signature = require('../../src/app/models/Signature').default;

let alice; // requester, English
let bob; // assignee, Portuguese

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice', locale: 'en-US', notification_token: 'alice-token' });
  bob = await createUser({ user_name: 'bob', locale: 'pt-BR', notification_token: 'bob-token' });
});
after(closeDb);

const done = [{ description: 'a', complete: true }];
const notDone = [{ description: 'a', complete: true }, { description: 'b', complete: false }];

test('confirm: only the assignee can complete', async () => {
  const task = await createTask(alice, bob);
  const res = await as(alice).put(`/tasks/confirm/${task.id}`).send({});
  assert.equal(res.status, 403);
  assert.equal((await as(bob).put('/tasks/confirm/999999').send({})).status, 404);
});

test('confirm: gated on all subtasks being done', async () => {
  const task = await createTask(alice, bob, { sub_task_list: notDone });
  const res = await as(bob).put(`/tasks/confirm/${task.id}`).send({});
  assert.equal(res.status, 400);
  assert.match(res.body.error, /subtasks/);
  assert.equal((await Task.findByPk(task.id)).end_date, null);
});

test('confirm: photo-proof tasks need a signature id', async () => {
  const task = await createTask(alice, bob, { confirm_photo: true, sub_task_list: done });
  const noPhoto = await as(bob).put(`/tasks/confirm/${task.id}`).send({});
  assert.equal(noPhoto.status, 400);
  assert.match(noPhoto.body.error, /photo/);

  const sig = await Signature.create({ name: 'proof.jpg', path: 'https://x/proof.jpg' });
  const withPhoto = await as(bob).put(`/tasks/confirm/${task.id}`).send({ signature_id: sig.id });
  assert.equal(withPhoto.status, 200);
  assert.ok(withPhoto.body.end_date);
  assert.equal(withPhoto.body.signature_id, sig.id);

  // The proof photo is exposed on the requester's finished list.
  const finished = await as(alice).get('/tasks/user/finished?nameFilter=&assigneeNameFilter=');
  assert.match(finished.body[0].signature.url, /\/files\/raw\/proof\.jpg$/);
});

test('confirm without approval: ends the task and pushes "task completed" to the requester in English', async () => {
  const task = await createTask(alice, bob, { name: 'Dishes', sub_task_list: done });
  const res = await as(bob).put(`/tasks/confirm/${task.id}`).send({ score: 5 });
  assert.equal(res.status, 200);
  assert.ok(res.body.end_date);
  assert.equal(res.body.approval_requested_at, null);
  assert.equal(res.body.score, 5);

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  const push = stubs.fcm.sent[0];
  assert.equal(push.token, 'alice-token');
  assert.equal(push.notification.title, 'Task completed');
  assert.equal(push.notification.body, '"Dishes" was marked done');

  // It moved lists on both sides.
  assert.equal((await as(bob).get('/tasks/unfinished?nameFilter=')).body.length, 0);
  assert.equal((await as(bob).get('/tasks/finished?nameFilter=')).body.length, 1);
  assert.equal((await as(alice).get('/tasks/user/finished?nameFilter=&assigneeNameFilter=')).body.length, 1);
});

test('confirm with approval: parks the task awaiting approval, Portuguese requester gets Portuguese copy', async () => {
  await alice.update({ locale: 'pt-BR' });
  const task = await createTask(alice, bob, { name: 'Louça', approval_required: true, sub_task_list: done });
  const res = await as(bob).put(`/tasks/confirm/${task.id}`).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.end_date, null);
  assert.ok(res.body.approval_requested_at);

  await flush();
  const push = stubs.fcm.sent[0];
  assert.equal(push.token, 'alice-token');
  assert.equal(push.notification.title, 'Aprovação solicitada');
  assert.equal(push.notification.body, '"Louça" aguarda sua aprovação');

  // Still on the unfinished lists (both sides) until approved.
  assert.equal((await as(bob).get('/tasks/unfinished?nameFilter=')).body.length, 1);
  const sent = await as(alice).get('/tasks/user/unfinished?nameFilter=&assigneeNameFilter=');
  assert.equal(sent.body.length, 1);
  assert.ok(sent.body[0].approval_requested_at);
  assert.equal((await as(alice).get('/tasks/user/finished?nameFilter=&assigneeNameFilter=')).body.length, 0);
});

test('approve: only the requester, only after a request; stamps end_date and pushes the assignee', async () => {
  const task = await createTask(alice, bob, { name: 'Louça', approval_required: true, sub_task_list: done });

  const early = await as(alice).put(`/tasks/${task.id}/approve`).send({});
  assert.equal(early.status, 400);
  assert.match(early.body.error, /not requested/);

  await as(bob).put(`/tasks/confirm/${task.id}`).send({});
  stubs.fcm.sent.length = 0;

  const notMine = await as(bob).put(`/tasks/${task.id}/approve`).send({});
  assert.equal(notMine.status, 403);

  const res = await as(alice).put(`/tasks/${task.id}/approve`).send({});
  assert.equal(res.status, 200);
  assert.ok(res.body.end_date);

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  assert.equal(stubs.fcm.sent[0].token, 'bob-token');
  assert.equal(stubs.fcm.sent[0].notification.title, 'alice');
  assert.equal(stubs.fcm.sent[0].notification.body, '"Louça" foi aprovada');

  const twice = await as(alice).put(`/tasks/${task.id}/approve`).send({});
  assert.equal(twice.status, 400);
  assert.match(twice.body.error, /already completed/);
  assert.equal((await as(alice).put('/tasks/999999/approve').send({})).status, 404);
});

test('approve: a canceled task cannot be approved', async () => {
  const task = await createTask(alice, bob, {
    approval_required: true,
    approval_requested_at: new Date(),
    canceled_at: new Date(),
  });
  const res = await as(alice).put(`/tasks/${task.id}/approve`).send({});
  assert.equal(res.status, 400);
});

test('reopen: requires feedback, clears completion + proof, bumps the counter, pushes feedback to the assignee', async () => {
  const sig = await Signature.create({ name: 'p.jpg', path: 'https://x/p.jpg' });
  const task = await createTask(alice, bob, {
    name: 'Louça',
    end_date: new Date(),
    signature_id: sig.id,
    sub_task_list: done,
  });

  const noFeedback = await as(alice).put(`/tasks/${task.id}/reopen`).send({ feedback: '   ' });
  assert.equal(noFeedback.status, 400);
  assert.match(noFeedback.body.error, /Feedback is required/);

  const notMine = await as(bob).put(`/tasks/${task.id}/reopen`).send({ feedback: 'x' });
  assert.equal(notMine.status, 403);

  const res = await as(alice).put(`/tasks/${task.id}/reopen`).send({ feedback: '  Faltou o tapete  ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.end_date, null);
  assert.equal(res.body.approval_requested_at, null);
  assert.equal(res.body.signature_id, null);
  assert.equal(res.body.reopen_count, 1);
  assert.equal(res.body.reopen_feedback, 'Faltou o tapete');
  assert.ok(res.body.reopened_at);

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  assert.equal(stubs.fcm.sent[0].token, 'bob-token');
  assert.equal(stubs.fcm.sent[0].notification.title, 'alice');
  assert.equal(stubs.fcm.sent[0].notification.body, 'Faltou o tapete');

  // Back on the open lists.
  assert.equal((await as(bob).get('/tasks/unfinished?nameFilter=')).body.length, 1);
  assert.equal((await as(bob).get('/tasks/finished?nameFilter=')).body.length, 0);

  // Second round increments.
  await as(bob).put(`/tasks/confirm/${task.id}`).send({});
  const again = await as(alice).put(`/tasks/${task.id}/reopen`).send({ feedback: 'de novo' });
  assert.equal(again.body.reopen_count, 2);
});

test('reopen: only completed or awaiting-approval tasks; not canceled ones', async () => {
  const open = await createTask(alice, bob);
  const res = await as(alice).put(`/tasks/${open.id}/reopen`).send({ feedback: 'x' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Only completed or awaiting-approval/);

  const canceled = await createTask(alice, bob, { end_date: new Date(), canceled_at: new Date() });
  const res2 = await as(alice).put(`/tasks/${canceled.id}/reopen`).send({ feedback: 'x' });
  assert.equal(res2.status, 400);

  const awaiting = await createTask(alice, bob, { approval_required: true, approval_requested_at: new Date() });
  const res3 = await as(alice).put(`/tasks/${awaiting.id}/reopen`).send({ feedback: 'x' });
  assert.equal(res3.status, 200);
});

test('reopen: feedback is capped at 2200 chars', async () => {
  const task = await createTask(alice, bob, { end_date: new Date() });
  const res = await as(alice).put(`/tasks/${task.id}/reopen`).send({ feedback: 'x'.repeat(3000) });
  assert.equal(res.status, 200);
  assert.equal(res.body.reopen_feedback.length, 2200);
});

test('cancel then revive: moves between lists and pushes the status comment to the assignee', async () => {
  const task = await createTask(alice, bob, { name: 'x' });
  const cancel = await as(alice)
    .put(`/tasks/${task.id}/cancel`)
    .send({ status: { comment: 'Não precisa mais' } });
  assert.equal(cancel.status, 200);
  assert.ok(cancel.body.canceled_at);
  await flush();
  assert.equal(stubs.fcm.sent[0].token, 'bob-token');
  assert.equal(stubs.fcm.sent[0].notification.body, 'Não precisa mais');
  assert.equal((await as(bob).get('/tasks/canceled?nameFilter=')).body.length, 1);
  assert.equal((await as(bob).get('/tasks/unfinished?nameFilter=')).body.length, 0);

  const revive = await as(alice).put(`/tasks/${task.id}/revive`).send({ status: { comment: 'Voltou' } });
  assert.equal(revive.status, 200);
  assert.equal(revive.body.canceled_at, null);
  assert.equal((await as(bob).get('/tasks/unfinished?nameFilter=')).body.length, 1);
  assert.equal((await as(alice).put('/tasks/999999/cancel').send({})).status, 404);
});

test('cancel without a status comment still works (empty push body, no crash)', async () => {
  const task = await createTask(alice, bob);
  const res = await as(alice).put(`/tasks/${task.id}/cancel`).send({});
  assert.equal(res.status, 200);
  await flush();
  assert.equal(stubs.fcm.sent[0].notification.body, '');
});

test('subtask toggle: server recomputes progress and pushes the requester in their language', async () => {
  const task = await createTask(alice, bob, { name: 'Faxina', sub_task_list: notDone });
  const list = [
    { description: 'a', complete: true },
    { description: 'b', complete: true },
  ];
  const res = await as(bob)
    .put(`/tasks/${task.id}/notification/worker/subtask`)
    .send({ sub_task_list: list, status_bar: 1, position: 1 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status_bar, 100);

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  const push = stubs.fcm.sent[0];
  assert.equal(push.token, 'alice-token');
  assert.equal(push.notification.title, 'Subtask: Faxina:');
  assert.equal(push.notification.body, 'bob completed · b');

  // Unticking pushes "reopened".
  stubs.fcm.sent.length = 0;
  list[1].complete = false;
  await as(bob).put(`/tasks/${task.id}/notification/worker/subtask`).send({ sub_task_list: list, position: 1 });
  await flush();
  assert.equal(stubs.fcm.sent[0].notification.body, 'bob reopened · b');
});

test('a push provider failure never fails the request', async () => {
  const task = await createTask(alice, bob, { sub_task_list: done });
  stubs.fcm.failNext = new Error('messaging/registration-token-not-registered');
  const res = await as(bob).put(`/tasks/confirm/${task.id}`).send({});
  assert.equal(res.status, 200);
  await flush();
});
