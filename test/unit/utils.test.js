const { test } = require('node:test');
const assert = require('node:assert/strict');

const { allSubtasksComplete, subtaskProgress } = require('../../src/app/utils/subtasks');
const { toDateOrNull } = require('../../src/app/utils/dates');
const { isBlockedBetween } = require('../../src/app/utils/blocks');
const { fileProxyUrl } = require('../../src/app/utils/publicUrl');
const { signSessionToken, buildSession } = require('../../src/app/utils/session');

test('allSubtasksComplete: no subtasks means not gated', () => {
  assert.equal(allSubtasksComplete(null), true);
  assert.equal(allSubtasksComplete(undefined), true);
  assert.equal(allSubtasksComplete([]), true);
  assert.equal(allSubtasksComplete('garbage'), true);
});

test('allSubtasksComplete: every item must be complete === true', () => {
  assert.equal(allSubtasksComplete([{ complete: true }, { complete: true }]), true);
  assert.equal(allSubtasksComplete([{ complete: true }, { complete: false }]), false);
  assert.equal(allSubtasksComplete([{ complete: 'true' }]), false);
  assert.equal(allSubtasksComplete([null, { complete: true }]), false);
});

test('subtaskProgress: equal weights when no weige_percentage', () => {
  assert.equal(subtaskProgress([]), 0);
  assert.equal(subtaskProgress(null), 0);
  assert.equal(subtaskProgress([{ complete: true }, { complete: false }]), 50);
  assert.equal(subtaskProgress([{ complete: true }, { complete: true }, { complete: true }]), 100);
  assert.equal(subtaskProgress([{ complete: false }]), 0);
});

test('subtaskProgress: honors weige_percentage weights when they sum > 0', () => {
  const list = [
    { complete: true, weige_percentage: 70 },
    { complete: false, weige_percentage: 30 },
  ];
  assert.equal(subtaskProgress(list), 70);
  // Weights as strings (JSON from the client) still count.
  assert.equal(
    subtaskProgress([
      { complete: true, weige_percentage: '25' },
      { complete: false, weige_percentage: '75' },
    ]),
    25
  );
  // All-zero weights fall back to equal weighting.
  assert.equal(
    subtaskProgress([
      { complete: true, weige_percentage: 0 },
      { complete: false, weige_percentage: 0 },
    ]),
    50
  );
});

test('toDateOrNull: empty picker values become null instead of a 500', () => {
  assert.equal(toDateOrNull(''), null);
  assert.equal(toDateOrNull(null), null);
  assert.equal(toDateOrNull(undefined), null);
  assert.equal(toDateOrNull('not a date'), null);
  const d = new Date('2030-01-02T03:04:05Z');
  assert.equal(toDateOrNull(d), d);
  assert.equal(toDateOrNull('2030-01-02T03:04:05Z').getTime(), d.getTime());
  assert.equal(toDateOrNull(d.getTime()).getTime(), d.getTime());
});

test('isBlockedBetween: either side blocking forbids the interaction', () => {
  const a = { email: 'a@x', blocked_list: null };
  const b = { email: 'b@x', blocked_list: [] };
  assert.equal(isBlockedBetween(a, b), false);
  assert.equal(isBlockedBetween({ ...a, blocked_list: ['b@x'] }, b), true);
  assert.equal(isBlockedBetween(a, { ...b, blocked_list: ['a@x'] }), true);
  assert.equal(isBlockedBetween(null, b), false);
  assert.equal(isBlockedBetween(a, undefined), false);
});

test('fileProxyUrl: encodes the key and strips trailing slashes', () => {
  process.env.RENDER_EXTERNAL_URL = '';
  process.env.APP_URL = 'http://localhost:3333/';
  assert.equal(fileProxyUrl('a b.png'), 'http://localhost:3333/files/raw/a%20b.png');
  process.env.RENDER_EXTERNAL_URL = 'godtasker-api.onrender.com';
  assert.equal(fileProxyUrl('k.jpg'), 'https://godtasker-api.onrender.com/files/raw/k.jpg');
  process.env.RENDER_EXTERNAL_URL = 'https://godtasker-api.onrender.com';
  assert.equal(fileProxyUrl('k.jpg'), 'https://godtasker-api.onrender.com/files/raw/k.jpg');
  process.env.RENDER_EXTERNAL_URL = '';
  process.env.APP_URL = 'http://localhost:3333';
});

test('session: token carries the user id and 7d expiry; session hides the hash', () => {
  const jwt = require('jsonwebtoken');
  const token = signSessionToken(42);
  const decoded = jwt.verify(token, process.env.APP_SECRET);
  assert.equal(decoded.id, 42);
  assert.ok(decoded.exp - decoded.iat === 7 * 24 * 3600);

  const session = buildSession({
    id: 42,
    user_name: 'dennis',
    email: 'd@x',
    password_hash: 'hash',
    avatar: null,
  });
  assert.equal(session.user.has_password, true);
  assert.equal(session.user.password_hash, undefined);
  assert.equal(typeof session.token, 'string');

  const googleOnly = buildSession({ id: 1, user_name: 'g', email: 'g@x', password_hash: null });
  assert.equal(googleOnly.user.has_password, false);
});
