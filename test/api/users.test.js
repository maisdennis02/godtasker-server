const { test, beforeEach, after } = require('node:test');
const {
  assert,
  as,
  anon,
  resetDb,
  createUser,
  createTask,
  closeDb,
  stubs,
  flush,
  User,
  Task,
} = require('../support/helpers');
const Message = require('../../src/app/models/Message').default;
const ChatMessage = require('../../src/app/models/ChatMessage').default;

let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ user_name: 'alice', locale: 'en' });
  bob = await createUser({ user_name: 'bob', locale: 'pt-BR', notification_token: 'bob-token' });
});
after(closeDb);

test('PUT /users: profile fields update; hash cannot be set directly', async () => {
  const res = await as(alice)
    .put('/users')
    .send({ first_name: 'Alice', bio: 'hi', password_hash: 'pwned', notification_token: 'x' });
  assert.equal(res.status, 200);
  assert.equal(res.body.first_name, 'Alice');
  const stored = await User.findByPk(alice.id);
  assert.ok(stored.password_hash.startsWith('$2'));
  assert.equal(await stored.checkPassword('password123'), true);
});

test('PUT /users: changing the password needs the current one and 8+ chars', async () => {
  const wrong = await as(alice).put('/users').send({ password: 'newpassword1', oldPassword: 'nope' });
  assert.equal(wrong.status, 401);
  const missing = await as(alice).put('/users').send({ password: 'newpassword1' });
  assert.equal(missing.status, 401);
  const short = await as(alice).put('/users').send({ password: 'short', oldPassword: 'password123' });
  assert.equal(short.status, 400);

  const ok = await as(alice).put('/users').send({ password: 'newpassword1', oldPassword: 'password123' });
  assert.equal(ok.status, 200);
  assert.equal((await anon().post('/sessions').send({ email: alice.email, password: 'newpassword1' })).status, 200);
  assert.equal((await anon().post('/sessions').send({ email: alice.email, password: 'password123' })).status, 401);
});

test('PUT /users: a Google-only account sets its first password without oldPassword', async () => {
  const g = await User.create({ email: 'g@test.local', user_name: 'g', google_id: 'sub', points: 0 });
  const res = await as(g).put('/users').send({ password: 'newpassword1' });
  assert.equal(res.status, 200);
  const login = await anon().post('/sessions').send({ email: 'g@test.local', password: 'newpassword1' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.has_password, true);
  // From now on the current password is required.
  const again = await as(g).put('/users').send({ password: 'newpassword2' });
  assert.equal(again.status, 401);
});

test('PUT /users/notifications/:id: stores token + locale; logout clears the token but keeps the locale', async () => {
  const res = await as(alice)
    .put(`/users/notifications/${alice.id}`)
    .send({ notification_token: 'alice-token', locale: 'pt-BR' });
  assert.equal(res.status, 200);
  let stored = await User.findByPk(alice.id);
  assert.equal(stored.notification_token, 'alice-token');
  assert.equal(stored.locale, 'pt-BR');
  // The response never leaks the token.
  assert.equal(res.body.user.notification_token, undefined);

  await as(alice).put(`/users/notifications/${alice.id}`).send({ notification_token: null });
  stored = await User.findByPk(alice.id);
  assert.equal(stored.notification_token, null);
  assert.equal(stored.locale, 'pt-BR');
});

test('PUT /users/notifications/:id: cannot set another user\'s push token', async () => {
  const res = await as(alice)
    .put(`/users/notifications/${bob.id}`)
    .send({ notification_token: 'hijack' });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal((await User.findByPk(bob.id)).notification_token, 'bob-token');
});

test('block / unblock: list is deduplicated and blocking hides the person from tasks', async () => {
  const block = await as(alice).put('/users/block').send({ email: alice.email, blocker_email: bob.email });
  assert.equal(block.status, 200);
  await as(alice).put('/users/block').send({ email: alice.email, blocker_email: bob.email });
  let stored = await User.findByPk(alice.id);
  assert.deepEqual(stored.blocked_list, [bob.email]);

  const task = await as(bob).post('/tasks').send({ assignee_email: alice.email, name: 'x' });
  assert.equal(task.status, 403);

  const unblock = await as(alice).put('/users/unblock').send({ email: alice.email, unblocker_email: bob.email });
  assert.equal(unblock.status, 200);
  stored = await User.findByPk(alice.id);
  assert.deepEqual(stored.blocked_list, []);
  assert.equal((await as(bob).post('/tasks').send({ assignee_email: alice.email, name: 'x' })).status, 200);

  assert.equal((await as(alice).put('/users/block').send({ email: alice.email, blocker_email: 'ghost@test.local' })).status, 404);
  assert.equal((await as(alice).put('/users/block').send({ blocker_email: alice.email })).status, 400);
});

test('block / unblock / report / follow always act as the signed-in user, whatever the body says', async () => {
  const carol = await createUser({ user_name: 'carol' });

  // Alice names Bob as "me" — only her own list changes.
  assert.equal((await as(alice).put('/users/block').send({ email: bob.email, blocker_email: carol.email })).status, 200);
  assert.deepEqual((await User.findByPk(bob.id)).blocked_list ?? [], []);
  assert.deepEqual((await User.findByPk(alice.id)).blocked_list, [carol.email]);

  await bob.update({ blocked_list: [carol.email] });
  await as(alice).put('/users/unblock').send({ email: bob.email, unblocker_email: carol.email });
  assert.deepEqual((await User.findByPk(bob.id)).blocked_list, [carol.email]);
  assert.deepEqual((await User.findByPk(alice.id)).blocked_list, []);

  // A report is filed by Alice even when the body claims Bob filed it.
  await as(alice).put('/users/flag').send({ email: carol.email, flagger_email: bob.email });
  const flagged = await User.findByPk(carol.id);
  assert.deepEqual(flagged.flagged_list, [alice.email]);
  assert.equal(flagged.flag_count, 1);
  assert.equal((await as(alice).put('/users/flag').send({ email: alice.email })).status, 400);

  // Following "as Bob" makes Alice the follower.
  assert.equal((await as(alice).post('/users/following').send({ user_email: bob.email, target_email: carol.email })).status, 200);
  assert.equal((await bob.getFollowing()).length, 0);
  assert.deepEqual((await alice.getFollowing()).map(u => u.id), [carol.id]);
  await bob.addFollowing(carol.id);
  await as(alice).put('/users/following').send({ user_email: bob.email, target_email: carol.email });
  assert.equal((await bob.getFollowing()).length, 1);
  assert.equal((await alice.getFollowing()).length, 0);
});

test('dashboard: always my own; due tiles count by the viewer time zone and skip tasks with no due date', async () => {
  const hour = 3600 * 1000;
  const started = { initiated_at: new Date() };
  await createTask(alice, bob, { ...started, due_date: new Date(Date.now() - hour) });
  await createTask(alice, bob, { ...started, due_date: null });
  const t = new Date();
  const tomorrowNoonUtc = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 12));
  await createTask(alice, bob, { ...started, due_date: tomorrowNoonUtc });
  const soon = new Date(Date.now() + 60 * 1000);
  await createTask(bob, alice, { ...started, due_date: soon });

  // Asking for Bob's dashboard still returns Alice's.
  const res = await as(alice).get(`/dashboard/${bob.id}?tz=UTC`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, alice.id);
  assert.equal(res.body.userCountInitiated, 3);
  assert.equal(res.body.userCountOverDue, 1);
  assert.equal(res.body.userCountTomorrowDue, 1);
  assert.equal(res.body.workerCountInitiated, 1);
  // Skip the "today" check in the last minute of a UTC day.
  if (soon.getUTCDate() === t.getUTCDate()) {
    assert.equal(res.body.workerCountTodayDue, 1);
  }

  const counts = await as(alice).get('/tasks/user/count?tz=UTC');
  assert.equal(counts.status, 200);
  assert.equal(counts.body.countOverDue, 1);
  assert.equal(counts.body.countTomorrowDue, 1);
});

test('follow / unfollow: no self-follow, pushes the target in their language, counts and lists update', async () => {
  const self = await as(alice).post('/users/following').send({ user_email: alice.email, target_email: alice.email });
  assert.equal(self.status, 400);

  const res = await as(alice).post('/users/following').send({ user_email: alice.email, target_email: bob.email });
  assert.equal(res.status, 200);
  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  assert.equal(stubs.fcm.sent[0].token, 'bob-token');
  assert.equal(stubs.fcm.sent[0].notification.title, 'alice');
  assert.equal(stubs.fcm.sent[0].notification.body, 'começou a seguir você');

  const following = await as(alice).get(`/users/following?contactName=alice&nameFilter=`);
  assert.deepEqual(following.body.map(u => u.user_name), ['bob']);
  const followers = await as(bob).get(`/users/followers/count?userName=bob`);
  assert.equal(followers.status, 200);
  assert.equal(followers.body, 1);
  const followerList = await as(bob).get(`/users/followers?userName=bob&nameFilter=`);
  assert.deepEqual(followerList.body.map(u => u.user_name), ['alice']);
  const followingCount = await as(alice).get(`/users/following/count?contactName=alice`);
  assert.equal(followingCount.body, 1);

  const dash = await as(alice).get(`/dashboard/${alice.id}`);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.countFollowing, 1);
  const bobDash = await as(bob).get(`/dashboard/${bob.id}`);
  assert.equal(bobDash.body.countFollowers, 1);

  const un = await as(alice).put('/users/following').send({ user_email: alice.email, target_email: bob.email });
  assert.equal(un.status, 200);
  const after = await as(alice).get(`/users/following?contactName=alice&nameFilter=`);
  assert.equal(after.body.length, 0);

  assert.equal((await as(alice).post('/users/following').send({ user_email: alice.email, target_email: 'ghost@x' })).status, 404);
});

test('DELETE /users/:id: only the owner, and it wipes tasks, chats and follows in one go', async () => {
  const carol = await createUser({ user_name: 'carol' });
  await createTask(alice, bob);
  await createTask(carol, alice);
  const keep = await createTask(carol, bob);
  await as(alice).post('/users/following').send({ user_email: alice.email, target_email: bob.email });
  await as(carol).post('/users/following').send({ user_email: carol.email, target_email: alice.email });
  const chat = await as(alice).post('/messages/start').send({ user_email: alice.email, worker_email: bob.email });
  await as(alice).post(`/messages/${chat.body.chat_id}/send`).send({ sender_email: alice.email, body: 'x' });
  const otherChat = await as(carol).post('/messages/start').send({ user_email: carol.email, worker_email: bob.email });

  const notMine = await as(bob).delete(`/users/${alice.id}`);
  assert.equal(notMine.status, 403);
  assert.ok(await User.findByPk(alice.id));

  const res = await as(alice).delete(`/users/${alice.id}`);
  assert.equal(res.status, 200);
  assert.equal(await User.findByPk(alice.id), null);
  assert.equal(await Task.count(), 1);
  assert.ok(await Task.findByPk(keep.id));
  assert.equal(await Message.count(), 1);
  assert.equal((await Message.findOne()).chat_id, otherChat.body.chat_id);
  assert.equal(await ChatMessage.count(), 0);
  const [follows] = await User.sequelize.query('SELECT * FROM user_followers');
  assert.equal(follows.length, 0);
});
