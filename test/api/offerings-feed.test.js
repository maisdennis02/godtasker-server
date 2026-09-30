const { test, beforeEach, after } = require('node:test');
const { assert, as, anon, resetDb, createUser, createTask, closeDb, User } = require('../support/helpers');
const Offering = require('../../src/app/models/Offering').default;

let me;
let ana;
let bruno;

beforeEach(async () => {
  await resetDb();
  me = await createUser({ user_name: 'me' });
  ana = await createUser({ user_name: 'Ana', occupation: 'Trainer' });
  bruno = await createUser({ user_name: 'bruno' });
});
after(closeDb);

const offer = (creator, name, overrides = {}) =>
  Offering.create({ creator_id: creator.id, name, display_in_profile: true, ...overrides });
const names = res => res.body.map(o => o.name);

test('GET /offerings/feed: requires auth', async () => {
  assert.equal((await anon().get('/offerings/feed')).status, 401);
});

test('GET /offerings/feed: other people\'s visible offerings, newest first, with who offers them', async () => {
  await offer(ana, 'Pilates');
  await offer(me, 'My own');
  await offer(bruno, 'Hidden', { display_in_profile: false });
  await offer(bruno, 'Removed', { canceled_at: new Date() });
  await offer(bruno, 'Dog walk');

  const res = await as(me).get('/offerings/feed');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(names(res), ['Dog walk', 'Pilates']);
  const pilates = res.body[1];
  assert.equal(pilates.creator.user_name, 'Ana');
  assert.equal(pilates.creator.occupation, 'Trainer');
  assert.equal(pilates.creator.password_hash, undefined);
  assert.equal(pilates.creator.phonenumber, undefined);
  assert.equal(pilates.request_count, 0);
  assert.equal(pilates.creator_followed, false);
});

test('GET /offerings/feed: people I follow come first', async () => {
  await offer(ana, 'Old from followed');
  await offer(bruno, 'Newer from stranger');
  await me.addFollowing(ana.id);

  const res = await as(me).get('/offerings/feed');
  assert.deepEqual(names(res), ['Old from followed', 'Newer from stranger']);
  assert.deepEqual(res.body.map(o => o.creator_followed), [true, false]);
});

test('GET /offerings/feed: blocks hide offerings both ways; deactivated and system accounts too', async () => {
  const carol = await createUser({ user_name: 'carol', canceled_at: new Date() });
  const system = await User.findByPk(1);
  await offer(ana, 'From someone I blocked');
  await offer(bruno, 'From someone who blocked me');
  await offer(carol, 'From a deactivated account');
  await offer(system, 'From the system account');
  const dave = await createUser({ user_name: 'dave', blocked_list: ['other@test.local'] });
  await offer(dave, 'Fine');
  await me.update({ blocked_list: [ana.email] });
  await bruno.update({ blocked_list: [me.email] });

  assert.deepEqual(names(await as(me).get('/offerings/feed')), ['Fine']);
});

test('GET /offerings/feed: q matches name, description or the person, literally', async () => {
  await offer(ana, 'Pilates class');
  await offer(bruno, 'Yoga', { description: 'Like pilates, but slower' });
  await offer(bruno, 'Dog walk');
  await offer(bruno, '50% off cut');
  await offer(bruno, '500 cuts');

  assert.deepEqual(names(await as(me).get('/offerings/feed?q=PILATES')), ['Yoga', 'Pilates class']);
  assert.deepEqual(names(await as(me).get('/offerings/feed?q=ana')), ['Pilates class']);
  assert.deepEqual(names(await as(me).get('/offerings/feed?q=50%25')), ['50% off cut']);
  assert.deepEqual(names(await as(me).get('/offerings/feed?q=nothing')), []);
});

test('GET /offerings/feed: paginates and reports seats taken', async () => {
  const first = await offer(ana, 'o1', { max_requests: 3 });
  for (let i = 2; i <= 5; i += 1) await offer(ana, `o${i}`);
  await createTask(me, ana, { offering_id: first.id });
  await createTask(bruno, ana, { offering_id: first.id, canceled_at: new Date() });

  assert.deepEqual(names(await as(me).get('/offerings/feed?limit=2&page=1')), ['o5', 'o4']);
  const last = await as(me).get('/offerings/feed?limit=2&page=3');
  assert.deepEqual(names(last), ['o1']);
  assert.equal(last.body[0].request_count, 1);
});
