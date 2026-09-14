const { test, beforeEach, after } = require('node:test');
const {
  assert,
  resetDb,
  createUser,
  createTask,
  closeDb,
  stubs,
  flush,
  Task,
} = require('../support/helpers');
const {
  notifyOverdueApprovals,
  APPROVAL_TENURE_MS,
} = require('../../src/lib/approvalOverdueNotifier');

let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice', locale: 'pt-BR', notification_token: 'alice-token' });
  bob = await createUser({ user_name: 'bob' });
});
after(closeDb);

const daysAgo = d => new Date(Date.now() - d * 24 * 3600 * 1000);

test('nags the requester exactly once when approval has waited longer than the tenure', async () => {
  assert.equal(APPROVAL_TENURE_MS, 3 * 24 * 3600 * 1000);
  const overdue = await createTask(alice, bob, {
    name: 'Louça',
    approval_required: true,
    approval_requested_at: daysAgo(4),
  });
  const fresh = await createTask(alice, bob, { approval_required: true, approval_requested_at: daysAgo(1) });
  const approved = await createTask(alice, bob, {
    approval_required: true,
    approval_requested_at: daysAgo(10),
    end_date: new Date(),
  });
  const canceled = await createTask(alice, bob, {
    approval_required: true,
    approval_requested_at: daysAgo(10),
    canceled_at: new Date(),
  });
  const alreadyNagged = await createTask(alice, bob, {
    approval_required: true,
    approval_requested_at: daysAgo(10),
    approval_overdue_notified_at: daysAgo(7),
  });

  await notifyOverdueApprovals();
  await flush();

  assert.equal(stubs.fcm.sent.length, 1);
  const push = stubs.fcm.sent[0];
  assert.equal(push.token, 'alice-token');
  assert.equal(push.notification.title, 'bob');
  assert.equal(push.notification.body, '"Louça" aguarda sua aprovação há 3 dias');

  assert.ok((await Task.findByPk(overdue.id)).approval_overdue_notified_at);
  for (const t of [fresh, approved, canceled]) {
    assert.equal((await Task.findByPk(t.id)).approval_overdue_notified_at, null, `task ${t.id}`);
  }
  assert.equal(
    (await Task.findByPk(alreadyNagged.id)).approval_overdue_notified_at.getTime(),
    alreadyNagged.approval_overdue_notified_at.getTime()
  );

  // Second run: nothing new.
  await notifyOverdueApprovals();
  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
});

test('stamps the task even when the requester has no push token, so it never re-fires', async () => {
  await alice.update({ notification_token: null });
  const t = await createTask(alice, bob, { approval_required: true, approval_requested_at: daysAgo(5) });
  await notifyOverdueApprovals();
  await flush();
  assert.equal(stubs.fcm.sent.length, 0);
  assert.ok((await Task.findByPk(t.id)).approval_overdue_notified_at);
});

test('a reopen clears the stamp so a later overdue approval nags again', async () => {
  const { as } = require('../support/helpers');
  const t = await createTask(alice, bob, {
    approval_required: true,
    approval_requested_at: daysAgo(5),
    sub_task_list: [{ complete: true }],
  });
  await notifyOverdueApprovals();
  await flush();
  assert.equal(stubs.fcm.sent.length, 1);

  const reopen = await as(alice).put(`/tasks/${t.id}/reopen`).send({ feedback: 'again' });
  assert.equal(reopen.status, 200);
  assert.equal((await Task.findByPk(t.id)).approval_overdue_notified_at, null);

  await as(bob).put(`/tasks/confirm/${t.id}`).send({});
  await Task.update({ approval_requested_at: daysAgo(4) }, { where: { id: t.id } });
  stubs.fcm.sent.length = 0;
  await notifyOverdueApprovals();
  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
});
