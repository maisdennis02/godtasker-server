// Shared fixtures for the API tests. Every test file gets its own process
// (node --test), so module state (onboarding sender cache, rate limiters, the
// FCM stub) is per file.
const assert = require('node:assert/strict');
const request = require('supertest');

const { ensureSchema, truncateAll, connection } = require('./db');
const stubs = require('./stubs');

const app = require('../../src/app').default;
const User = require('../../src/app/models/User').default;
const Task = require('../../src/app/models/Task').default;
const { signSessionToken } = require('../../src/app/utils/session');
const { ONBOARDING_SENDER_EMAIL } = require('../../src/lib/onboarding');

let counter = 0;

// Fresh schema + empty tables + the LalaTask system account (always id 1,
// which keeps src/lib/onboarding.js's cached sender id valid across resets).
async function resetDb() {
  await ensureSchema();
  await truncateAll();
  stubs.reset();
  counter = 0;
  return User.create({
    email: ONBOARDING_SENDER_EMAIL,
    user_name: 'LalaTask',
    first_name: 'LalaTask',
    password: 'onboarding-password-unused',
    points: 0,
  });
}

async function createUser(overrides = {}) {
  counter += 1;
  const n = counter;
  return User.create({
    user_name: `user${n}`,
    email: `user${n}@test.local`,
    password: 'password123',
    points: 0,
    ...overrides,
  });
}

function tokenFor(user) {
  return signSessionToken(user.id);
}

// supertest request builder pre-authenticated as `user`.
function as(user) {
  const token = tokenFor(user);
  const auth = req => req.set('Authorization', `Bearer ${token}`);
  return {
    get: url => auth(request(app).get(url)),
    post: url => auth(request(app).post(url)),
    put: url => auth(request(app).put(url)),
    delete: url => auth(request(app).delete(url)),
  };
}

const anon = () => request(app);

async function createTask(requester, assignee, overrides = {}) {
  return Task.create({
    requester_id: requester.id,
    requester_email: requester.email,
    assignee_id: assignee.id,
    assignee_email: assignee.email,
    name: 'Test task',
    description: 'desc',
    sub_task_list: [],
    status_bar: 0,
    points: 0,
    confirm_photo: false,
    approval_required: false,
    ...overrides,
  });
}

async function closeDb() {
  await connection.close();
}

// The push send is fire-and-forget; wait a tick for the stub to record it.
const flush = () => new Promise(resolve => setImmediate(resolve));

module.exports = {
  app,
  assert,
  request,
  stubs,
  resetDb,
  createUser,
  createTask,
  tokenFor,
  as,
  anon,
  closeDb,
  flush,
  User,
  Task,
};
