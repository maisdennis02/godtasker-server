const { test, beforeEach, after } = require('node:test');
const {
  assert,
  as,
  resetDb,
  createUser,
  closeDb,
  stubs,
  flush,
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

const start = (me, a, b) => as(me).post('/messages/start').send({ user_email: a, worker_email: b });

test('start: creates one conversation per pair, idempotent in either direction', async () => {
  const first = await start(alice, alice.email, bob.email);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(typeof first.body.chat_id, 'number');

  const same = await start(alice, alice.email, bob.email);
  const reversed = await start(bob, bob.email, alice.email);
  assert.equal(same.body.chat_id, first.body.chat_id);
  assert.equal(reversed.body.chat_id, first.body.chat_id);
  assert.equal(await Message.count(), 1);

  // A different pair gets the next chat id.
  const carol = await createUser({ user_name: 'carol' });
  const other = await start(alice, alice.email, carol.email);
  assert.equal(other.body.chat_id, first.body.chat_id + 1);
});

test('start: both parties must exist; missing fields are 400', async () => {
  const ghost = await start(alice, alice.email, 'ghost@test.local');
  assert.equal(ghost.status, 404);
  assert.match(ghost.body.error, /ghost@test.local/);
  assert.equal(await Message.count(), 0);
  const missing = await as(alice).post('/messages/start').send({ user_email: alice.email });
  assert.equal(missing.status, 400);
});

test('start + send: blocked in either direction is 403 and nothing is persisted', async () => {
  const chat = await start(alice, alice.email, bob.email);
  await bob.update({ blocked_list: [alice.email] });

  assert.equal((await start(alice, alice.email, bob.email)).status, 403);
  assert.equal((await start(bob, bob.email, alice.email)).status, 403);

  const send = await as(alice)
    .post(`/messages/${chat.body.chat_id}/send`)
    .send({ sender_email: alice.email, recipient_email: bob.email, body: 'hi' });
  assert.equal(send.status, 403);
  assert.equal(await ChatMessage.count(), 0);
  await flush();
  assert.equal(stubs.fcm.sent.length, 0);
});

test('send: persists, bumps the header, pushes the recipient with the sender name', async () => {
  const chat = await start(alice, alice.email, bob.email);
  const chatId = chat.body.chat_id;
  const before = (await Message.findOne({ where: { chat_id: chatId } })).messaged_at;
  await new Promise(r => setTimeout(r, 5));

  const res = await as(alice)
    .post(`/messages/${chatId}/send`)
    .send({ sender_email: alice.email, recipient_email: bob.email, body: 'Oi Bob' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.chat_id, chatId);
  assert.equal(res.body.body, 'Oi Bob');

  const header = await Message.findOne({ where: { chat_id: chatId } });
  assert.ok(Number(header.messaged_at) > Number(before));

  await flush();
  assert.equal(stubs.fcm.sent.length, 1);
  assert.equal(stubs.fcm.sent[0].token, 'bob-token');
  assert.equal(stubs.fcm.sent[0].notification.title, 'alice');
  assert.equal(stubs.fcm.sent[0].notification.body, 'Oi Bob');

  const empty = await as(alice).post(`/messages/${chatId}/send`).send({ sender_email: alice.email });
  assert.equal(empty.status, 400);
});

test('thread: ordered oldest first', async () => {
  const chat = await start(alice, alice.email, bob.email);
  const chatId = chat.body.chat_id;
  for (const body of ['one', 'two', 'three']) {
    await as(alice)
      .post(`/messages/${chatId}/send`)
      .send({ sender_email: alice.email, recipient_email: bob.email, body });
  }
  const res = await as(bob).get(`/messages/${chatId}/thread`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map(m => m.body), ['one', 'two', 'three']);
});

test('conversation list: includes both parties, hides blocked users', async () => {
  const carol = await createUser({ user_name: 'carol' });
  await start(alice, alice.email, bob.email);
  await start(carol, carol.email, alice.email);

  const list = await as(alice).get(`/messages?user_email=${alice.email}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 2);

  await alice.update({ blocked_list: [carol.email] });
  const filtered = await as(alice).get(`/messages?user_email=${alice.email}`);
  assert.equal(filtered.body.length, 1);
  assert.equal(filtered.body[0].worker_email, bob.email);
});

test('delete conversation: removes the header and its thread so a reused chat_id starts clean', async () => {
  const chat = await start(alice, alice.email, bob.email);
  const chatId = chat.body.chat_id;
  await as(alice).post(`/messages/${chatId}/send`).send({ sender_email: alice.email, body: 'x' });

  const header = await Message.findOne({ where: { chat_id: chatId } });
  const res = await as(alice).delete(`/messages/${header.id}`);
  assert.equal(res.status, 200);
  assert.equal(await Message.count(), 0);
  assert.equal(await ChatMessage.count({ where: { chat_id: chatId } }), 0);
  assert.equal((await as(alice).delete(`/messages/${header.id}`)).status, 404);

  // The next conversation reuses the id and has an empty thread.
  const again = await start(alice, alice.email, bob.email);
  assert.equal(again.body.chat_id, chatId);
  const thread = await as(alice).get(`/messages/${chatId}/thread`);
  assert.equal(thread.body.length, 0);
});
