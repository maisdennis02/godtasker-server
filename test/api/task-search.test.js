const { test, beforeEach, after } = require('node:test');
const { assert, as, anon, resetDb, createUser, createTask, closeDb } = require('../support/helpers');

let alice;
let bob;
let carol;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice' });
  bob = await createUser({ user_name: 'Bruno' });
  carol = await createUser({ user_name: 'carol' });
});
after(closeDb);

const daysFromNow = n => new Date(Date.now() + n * 24 * 3600 * 1000);
const names = res => res.body.map(t => t.name);

test('GET /tasks/search: requires auth and a valid side', async () => {
  assert.equal((await anon().get('/tasks/search?side=sent&q=x')).status, 401);
  assert.equal((await as(alice).get('/tasks/search?q=x')).status, 400);
  assert.equal((await as(alice).get('/tasks/search?side=all&q=x')).status, 400);
});

test('GET /tasks/search: an empty query returns nothing', async () => {
  await createTask(alice, bob, { name: 'Wash car' });
  const res = await as(alice).get('/tasks/search?side=sent&q=%20%20');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('GET /tasks/search: matches task name case-insensitively across open, done and canceled', async () => {
  await createTask(alice, bob, { name: 'Wash CAR' });
  await createTask(alice, bob, { name: 'car wax', end_date: new Date() });
  await createTask(alice, carol, { name: 'Rent a car', canceled_at: new Date() });
  await createTask(alice, bob, { name: 'Dishes' });

  const res = await as(alice).get('/tasks/search?side=sent&q=Car');
  assert.equal(res.status, 200);
  assert.deepEqual(names(res).sort(), ['Rent a car', 'Wash CAR', 'car wax']);
});

test('GET /tasks/search: matches the assignee name on the sent side', async () => {
  await createTask(alice, bob, { name: 'Dishes' });
  await createTask(alice, carol, { name: 'Laundry' });

  const res = await as(alice).get('/tasks/search?side=sent&q=bru');
  assert.deepEqual(names(res), ['Dishes']);
  assert.equal(res.body[0].assignee.user_name, 'Bruno');
});

test('GET /tasks/search: matches the requester name on the received side, never my sent tasks', async () => {
  await createTask(bob, alice, { name: 'From Bruno' });
  await createTask(carol, alice, { name: 'From Carol' });
  await createTask(alice, bob, { name: 'To Bruno' });

  const res = await as(alice).get('/tasks/search?side=received&q=bruno');
  assert.deepEqual(names(res), ['From Bruno']);
  assert.equal(res.body[0].requester.user_name, 'Bruno');
});

test("GET /tasks/search: never returns other users' tasks", async () => {
  await createTask(bob, carol, { name: 'Secret car' });
  const sent = await as(alice).get('/tasks/search?side=sent&q=car');
  const received = await as(alice).get('/tasks/search?side=received&q=car');
  assert.deepEqual(sent.body, []);
  assert.deepEqual(received.body, []);
});

test('GET /tasks/search: LIKE wildcards in the query match literally', async () => {
  await createTask(alice, bob, { name: '50% off' });
  await createTask(alice, bob, { name: '500 boxes' });
  await createTask(alice, bob, { name: 'a_b' });
  await createTask(alice, bob, { name: 'axb' });

  assert.deepEqual(names(await as(alice).get('/tasks/search?side=sent&q=50%25')), ['50% off']);
  assert.deepEqual(names(await as(alice).get('/tasks/search?side=sent&q=a_b')), ['a_b']);
});

test('GET /tasks/search: open first by due date, then closed by most recently closed', async () => {
  await createTask(alice, bob, { name: 'job done old', end_date: daysFromNow(-5) });
  await createTask(alice, bob, { name: 'job open later', due_date: daysFromNow(5) });
  await createTask(alice, bob, { name: 'job canceled recent', canceled_at: daysFromNow(-1) });
  await createTask(alice, bob, { name: 'job open no due' });
  await createTask(alice, bob, { name: 'job open soon', due_date: daysFromNow(1) });

  const res = await as(alice).get('/tasks/search?side=sent&q=job');
  assert.deepEqual(names(res), [
    'job open soon',
    'job open later',
    'job open no due',
    'job canceled recent',
    'job done old',
  ]);
});

test('GET /tasks/search: paginates with limit/page', async () => {
  for (let i = 1; i <= 5; i += 1) {
    await createTask(alice, bob, { name: `task ${i}`, due_date: daysFromNow(i) });
  }
  const p1 = await as(alice).get('/tasks/search?side=sent&q=task&limit=2&page=1');
  const p3 = await as(alice).get('/tasks/search?side=sent&q=task&limit=2&page=3');
  assert.deepEqual(names(p1), ['task 1', 'task 2']);
  assert.deepEqual(names(p3), ['task 5']);
});
