const { test, beforeEach, after } = require('node:test');
const {
  assert,
  as,
  resetDb,
  createUser,
  closeDb,
  stubs,
  flush,
  Task,
} = require('../support/helpers');
const Offering = require('../../src/app/models/Offering').default;

let creator; // offers the service, becomes the assignee
let requester;

beforeEach(async () => {
  await resetDb();
  creator = await createUser({ user_name: 'creator', locale: 'pt-BR', notification_token: 'creator-token' });
  requester = await createUser({ user_name: 'requester', locale: 'en' });
});
after(closeDb);

const future = hours => new Date(Date.now() + hours * 3600 * 1000);
const makeOffering = (body = {}) =>
  as(creator)
    .post('/offerings')
    .send({ name: 'Massage', description: 'd', price: 10, display_in_profile: true, ...body });

test('store: creator comes from the token; schedule validation', async () => {
  const res = await makeOffering({ creator_id: requester.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.creator_id, creator.id);
  assert.equal(res.body.request_count, 0);

  assert.equal((await makeOffering({ duration_minutes: 0 })).status, 400);
  assert.equal((await makeOffering({ duration_minutes: 1.5 })).status, 400);
  assert.equal((await makeOffering({ max_requests: 0 })).status, 400);
  assert.equal((await makeOffering({ start_date: 'nope' })).status, 400);
  const backwards = await makeOffering({ start_date: future(48), due_date: future(24) });
  assert.equal(backwards.status, 400);
  assert.match(backwards.body.error, /Due date must be after/);
  const windowTooShort = await makeOffering({
    requester_sets_dates: true,
    duration_minutes: 120,
    availability: { days: [1], from: '08:00', to: '09:00' },
  });
  assert.equal(windowTooShort.status, 400);
  assert.match(windowTooShort.body.error, /shorter than the duration/);
});

test('store: a fixed duration derives the due date; availability only kept when requester sets dates', async () => {
  const start = future(24);
  const res = await makeOffering({ start_date: start, due_date: future(200), duration_minutes: 60 });
  assert.equal(new Date(res.body.due_date).getTime(), start.getTime() + 3600 * 1000);

  const ignored = await makeOffering({
    requester_sets_dates: false,
    availability: { days: [1], from: '08:00', to: '17:00' },
  });
  assert.equal(ignored.body.availability, null);
  const kept = await makeOffering({
    requester_sets_dates: true,
    availability: { days: [1], from: '08:00', to: '17:00', tz: 'America/Sao_Paulo' },
  });
  assert.deepEqual(kept.body.availability, { days: [1], from: '08:00', to: '17:00', tz: 'America/Sao_Paulo' });
});

test('index: lists the creator\'s offerings, profile subset, and live request counts', async () => {
  const a = await makeOffering({ name: 'A', display_in_profile: true });
  await makeOffering({ name: 'B', display_in_profile: false });
  await as(requester).post(`/offerings/${a.body.id}/request`).send({});

  const res = await as(requester).get(`/offerings?creator_id=${creator.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.offerings.map(o => o.name).sort(), ['A', 'B']);
  assert.deepEqual(res.body.displays.map(o => o.name), ['A']);
  assert.equal(res.body.offerings.find(o => o.name === 'A').request_count, 1);
  assert.equal(res.body.offerings.find(o => o.name === 'B').request_count, 0);
});

test('request: spawns a task assigned to the creator with the offering copied, and pushes the creator', async () => {
  const offering = await makeOffering({
    name: 'Massage',
    sub_task_list: [{ description: 'towel', complete: false }],
    confirm_photo_option: 1,
    start_date: future(24),
    due_date: future(26),
  });
  const res = await as(requester).post(`/offerings/${offering.body.id}/request`).send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.offering_id, offering.body.id);
  assert.equal(res.body.requester_id, requester.id);
  assert.equal(res.body.assignee_id, creator.id);
  assert.equal(res.body.assignee_email, creator.email);
  assert.equal(res.body.name, 'Massage');
  assert.equal(res.body.confirm_photo, true);
  assert.equal(res.body.price, 10);
  assert.equal(res.body.sub_task_list.length, 1);

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  assert.equal(stubs.fcm.sent[0].token, 'creator-token');
  assert.equal(stubs.fcm.sent[0].notification.title, 'requester');
  assert.equal(stubs.fcm.sent[0].notification.body, 'solicitou: Massage');

  // Shows up as received for the creator and sent for the requester.
  assert.equal((await as(creator).get('/tasks/unfinished?nameFilter=')).body.length, 1);
  assert.equal((await as(requester).get('/tasks/user/unfinished?nameFilter=&assigneeNameFilter=')).body.length, 1);
  assert.equal((await as(requester).post('/offerings/999999/request').send({})).status, 404);
});

test('request: blocked either way is 403', async () => {
  const offering = await makeOffering();
  await creator.update({ blocked_list: [requester.email] });
  assert.equal((await as(requester).post(`/offerings/${offering.body.id}/request`).send({})).status, 403);
  await creator.update({ blocked_list: [] });
  await requester.update({ blocked_list: [creator.email] });
  assert.equal((await as(requester).post(`/offerings/${offering.body.id}/request`).send({})).status, 403);
  assert.equal(await Task.count(), 0);
});

test('request: seat limit counts only active tasks; a canceled seat frees up', async () => {
  const offering = await makeOffering({ max_requests: 1 });
  const first = await as(requester).post(`/offerings/${offering.body.id}/request`).send({});
  assert.equal(first.status, 200);
  const other = await createUser({ user_name: 'other' });
  const full = await as(other).post(`/offerings/${offering.body.id}/request`).send({});
  assert.equal(full.status, 409);
  assert.match(full.body.error, /full/);

  await as(requester).put(`/tasks/${first.body.id}/cancel`).send({});
  const again = await as(other).post(`/offerings/${offering.body.id}/request`).send({});
  assert.equal(again.status, 200);
});

test('request: concurrent requests cannot oversubscribe the last seat', async () => {
  const offering = await makeOffering({ max_requests: 2 });
  const users = await Promise.all([1, 2, 3, 4, 5].map(i => createUser({ user_name: `u${i}` })));
  const results = await Promise.all(
    users.map(u => as(u).post(`/offerings/${offering.body.id}/request`).send({}))
  );
  const statuses = results.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 200, 409, 409, 409]);
  assert.equal(await Task.count({ where: { offering_id: offering.body.id } }), 2);
});

test('request: an offering whose creator-set dates already passed is 409', async () => {
  const offering = await Offering.create({
    creator_id: creator.id,
    name: 'Old',
    start_date: new Date(Date.now() - 48 * 3600 * 1000),
    due_date: new Date(Date.now() - 24 * 3600 * 1000),
  });
  const res = await as(requester).post(`/offerings/${offering.id}/request`).send({});
  assert.equal(res.status, 409);
  assert.match(res.body.error, /already ended/);
});

test('request: requester-chosen dates respect the availability window and duration', async () => {
  const offering = await makeOffering({
    requester_sets_dates: true,
    duration_minutes: 60,
    availability: { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', tz: 'UTC' },
  });
  const id = offering.body.id;
  // Monday 14 Sep 2026 10:00Z is inside the window.
  const ok = await as(requester).post(`/offerings/${id}/request`).send({ start_date: '2026-09-14T10:00:00Z' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(new Date(ok.body.due_date).toISOString(), '2026-09-14T11:00:00.000Z');
  assert.equal(ok.body.duration_minutes, 60);

  const sunday = await as(requester).post(`/offerings/${id}/request`).send({ start_date: '2026-09-13T10:00:00Z' });
  assert.equal(sunday.status, 400);
  assert.match(sunday.body.error, /only available/);

  const late = await as(requester).post(`/offerings/${id}/request`).send({ start_date: '2026-09-14T16:30:00Z' });
  assert.equal(late.status, 400);
  assert.match(late.body.error, /must finish by 17:00/);

  const bad = await as(requester).post(`/offerings/${id}/request`).send({ start_date: 'garbage' });
  assert.equal(bad.status, 400);
});

test('request: when the requester may not set dates, body dates are ignored', async () => {
  const start = future(24);
  const offering = await makeOffering({ requester_sets_dates: false, start_date: start, due_date: future(30) });
  const res = await as(requester)
    .post(`/offerings/${offering.body.id}/request`)
    .send({ start_date: '2031-01-01T00:00:00Z' });
  assert.equal(res.status, 200);
  assert.equal(new Date(res.body.start_date).getTime(), start.getTime());
});

test('update / delete: partial updates keep the schedule; delete hides it from lists', async () => {
  const offering = await makeOffering({ start_date: future(24), due_date: future(30), max_requests: 3 });
  const upd = await as(creator).put(`/offerings/${offering.body.id}`).send({ name: 'Renamed' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.name, 'Renamed');
  assert.equal(upd.body.max_requests, 3);
  assert.ok(upd.body.start_date);

  const cleared = await as(creator).put(`/offerings/${offering.body.id}`).send({ max_requests: '' });
  assert.equal(cleared.body.max_requests, null);

  const del = await as(creator).delete(`/offerings/${offering.body.id}`);
  assert.equal(del.status, 200);
  const list = await as(creator).get(`/offerings?creator_id=${creator.id}`);
  assert.equal(list.body.offerings.length, 0);
  assert.equal((await as(creator).delete(`/offerings/${offering.body.id}`)).status, 404);
});

test('update / delete: only the creator can change or remove an offering', async () => {
  const offering = await makeOffering();
  const upd = await as(requester).put(`/offerings/${offering.body.id}`).send({ name: 'hacked' });
  assert.equal(upd.status, 403, JSON.stringify(upd.body));
  const del = await as(requester).delete(`/offerings/${offering.body.id}`);
  assert.equal(del.status, 403, JSON.stringify(del.body));
  assert.equal((await Offering.findByPk(offering.body.id)).name, 'Massage');
});
