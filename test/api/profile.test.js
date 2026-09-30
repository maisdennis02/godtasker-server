const { test, beforeEach, after } = require('node:test');
const { assert, as, anon, resetDb, createUser, closeDb } = require('../support/helpers');
const Offering = require('../../src/app/models/Offering').default;

let alice;
let bob;

const PRIVATE = ['phonenumber', 'birth_date', 'gender', 'hint', 'locale', 'blocked_list', 'flag_count'];
const SECRETS = ['password_hash', 'notification_token', 'google_id'];

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice' });
  bob = await createUser({
    user_name: 'bob',
    occupation: 'Trainer',
    bio: 'I train people',
    instagram: '@bob',
    phonenumber: '+5511999999999',
    birth_date: '1990-01-01',
    gender: 'male',
    locale: 'pt-BR',
    notification_token: 'bob-token',
    blocked_list: ['someone@test.local'],
    flagged_list: ['reporter@test.local'],
    flag_count: 1,
  });
});
after(closeDb);

const offer = (creator, overrides = {}) =>
  Offering.create({ creator_id: creator.id, name: 'Session', display_in_profile: true, ...overrides });

test('GET /users/:id/profile: requires auth; unknown or deactivated users are 404', async () => {
  assert.equal((await anon().get(`/users/${bob.id}/profile`)).status, 401);
  assert.equal((await as(alice).get('/users/999999/profile')).status, 404);
  assert.equal((await as(alice).get('/users/abc/profile')).status, 404);
  await bob.update({ canceled_at: new Date() });
  assert.equal((await as(alice).get(`/users/${bob.id}/profile`)).status, 404);
});

test('GET /users/:id/profile: what the person presents, never their private details', async () => {
  const res = await as(alice).get(`/users/${bob.id}/profile`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { user } = res.body;
  assert.equal(user.user_name, 'bob');
  assert.equal(user.occupation, 'Trainer');
  assert.equal(user.bio, 'I train people');
  assert.equal(user.instagram, '@bob');
  assert.equal(user.email, bob.email);
  for (const field of [...PRIVATE, ...SECRETS]) {
    assert.equal(user[field], undefined, `${field} leaked`);
  }
  assert.deepEqual(user.flagged_list, []);
  assert.equal(res.body.is_self, false);
  assert.equal(res.body.is_following, false);
  assert.equal(res.body.blocked_by_me, false);
});

test('GET /users/:id/profile: my own profile comes back whole', async () => {
  const res = await as(bob).get(`/users/${bob.id}/profile`);
  assert.equal(res.status, 200);
  assert.equal(res.body.is_self, true);
  assert.equal(res.body.user.phonenumber, '+5511999999999');
  assert.deepEqual(res.body.user.blocked_list, ['someone@test.local']);
  for (const field of SECRETS) assert.equal(res.body.user[field], undefined);
});

test('GET /users/:id/profile: counts followers, following and the offerings a visitor can see', async () => {
  const carol = await createUser({ user_name: 'carol' });
  const gone = await createUser({ user_name: 'gone', canceled_at: new Date() });
  await alice.addFollowing(bob.id);
  await carol.addFollowing(bob.id);
  await gone.addFollowing(bob.id);
  await bob.addFollowing(carol.id);
  await offer(bob, { name: 'shown' });
  await offer(bob, { name: 'legacy', display_in_profile: null });
  await offer(bob, { name: 'hidden', display_in_profile: false });
  await offer(bob, { name: 'removed', canceled_at: new Date() });
  await offer(alice);

  const res = await as(alice).get(`/users/${bob.id}/profile`);
  assert.deepEqual(res.body.counts, { offerings: 2, followers: 2, following: 1 });
  assert.equal(res.body.is_following, true);

  const own = await as(bob).get(`/users/${bob.id}/profile`);
  assert.equal(own.body.counts.offerings, 3);

  // The offerings list applies the same rule.
  const visitor = await as(alice).get(`/offerings?creator_id=${bob.id}`);
  assert.deepEqual(visitor.body.offerings.map(o => o.name).sort(), ['legacy', 'shown']);
  const owner = await as(bob).get(`/offerings?creator_id=${bob.id}`);
  assert.deepEqual(owner.body.offerings.map(o => o.name).sort(), ['hidden', 'legacy', 'shown']);
});

test('GET /users/:id/profile: blocks — mine is flagged, theirs makes the person disappear', async () => {
  await alice.update({ blocked_list: [bob.email] });
  const mine = await as(alice).get(`/users/${bob.id}/profile`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.blocked_by_me, true);

  // Bob sees nothing of the person who blocked him.
  assert.equal((await as(bob).get(`/users/${alice.id}/profile`)).status, 404);
});

test('user lists and lookups hide private details of other people, keep mine', async () => {
  await alice.addFollowing(bob.id);
  await bob.addFollowing(alice.id);
  await alice.update({ phonenumber: '+5511888888888', blocked_list: ['x@test.local'] });

  const one = await as(alice).get(`/users/${bob.id}`);
  const list = await as(alice).get('/users');
  const following = await as(alice).get('/users/following?contactName=alice&nameFilter=');
  const followers = await as(alice).get('/users/followers?userName=alice&nameFilter=');
  const bobs = [
    one.body,
    list.body.find(u => u.id === bob.id),
    following.body.find(u => u.id === bob.id),
    followers.body.find(u => u.id === bob.id),
  ];
  for (const seen of bobs) {
    assert.equal(seen.user_name, 'bob');
    assert.equal(seen.email, bob.email);
    for (const field of [...PRIVATE, ...SECRETS]) {
      assert.equal(seen[field], undefined, `${field} leaked`);
    }
    assert.deepEqual(seen.flagged_list, []);
  }

  // Both clients read "who I blocked" from my own record.
  const me = await as(alice).get(`/users/${alice.id}`);
  assert.deepEqual(me.body.blocked_list, ['x@test.local']);
  assert.equal(me.body.phonenumber, '+5511888888888');
  assert.deepEqual(list.body.find(u => u.id === alice.id).blocked_list, ['x@test.local']);
});

test('a report shows only to the person who filed it', async () => {
  await as(alice).put('/users/flag').send({ email: bob.email });
  const carol = await createUser({ user_name: 'carol' });
  assert.deepEqual((await as(alice).get(`/users/${bob.id}`)).body.flagged_list, [alice.email]);
  assert.deepEqual((await as(carol).get(`/users/${bob.id}`)).body.flagged_list, []);
});
