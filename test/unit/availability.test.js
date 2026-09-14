const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAvailability,
  availabilityViolation,
  describeAvailability,
} = require('../../src/app/utils/availability');

test('parseAvailability: empty input means no window', () => {
  assert.deepEqual(parseAvailability(undefined), { value: null });
  assert.deepEqual(parseAvailability(null), { value: null });
  assert.deepEqual(parseAvailability(''), { value: null });
});

test('parseAvailability: rejects malformed windows', () => {
  assert.ok(parseAvailability('mon').error);
  assert.ok(parseAvailability({ days: [], from: '08:00', to: '17:00' }).error);
  assert.ok(parseAvailability({ days: [9], from: '08:00', to: '17:00' }).error);
  assert.ok(parseAvailability({ days: [1], from: '8:00', to: '17:00' }).error);
  assert.ok(parseAvailability({ days: [1], from: '24:00', to: '17:00' }).error);
  assert.ok(parseAvailability({ days: [1], from: '17:00', to: '08:00' }).error);
  assert.ok(parseAvailability({ days: [1], from: '08:00', to: '08:00' }).error);
});

test('parseAvailability: normalises days and defaults tz to UTC', () => {
  const { value } = parseAvailability({
    days: ['5', 1, 1, 3],
    from: '08:00',
    to: '17:00',
    tz: 'Not/AZone',
  });
  assert.deepEqual(value, { days: [1, 3, 5], from: '08:00', to: '17:00', tz: 'UTC' });
  const sp = parseAvailability({ days: [1], from: '08:00', to: '17:00', tz: 'America/Sao_Paulo' });
  assert.equal(sp.value.tz, 'America/Sao_Paulo');
});

test('availabilityViolation: weekday and hour checks in the window timezone', () => {
  const window = { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', tz: 'America/Sao_Paulo' };
  // Monday 14 Sep 2026 10:00 in São Paulo (UTC-3) = 13:00Z
  assert.equal(availabilityViolation(window, new Date('2026-09-14T13:00:00Z')), null);
  // Same instant is 10:00 Monday; 06:00 local is too early
  assert.match(availabilityViolation(window, new Date('2026-09-14T09:00:00Z')), /only available/);
  // Sunday 13 Sep 2026 10:00 local
  assert.match(availabilityViolation(window, new Date('2026-09-13T13:00:00Z')), /only available/);
  // 16:30 local with a 60 min duration overruns 17:00
  assert.match(availabilityViolation(window, new Date('2026-09-14T19:30:00Z'), 60), /must finish by 17:00/);
  // 16:00 local with a 60 min duration ends exactly at 17:00 → fine
  assert.equal(availabilityViolation(window, new Date('2026-09-14T19:00:00Z'), 60), null);
});

test('availabilityViolation: timezone matters (a UTC window vs São Paulo)', () => {
  const utcWindow = { days: [1], from: '08:00', to: '10:00', tz: 'UTC' };
  assert.equal(availabilityViolation(utcWindow, new Date('2026-09-14T09:00:00Z')), null);
  const spWindow = { ...utcWindow, tz: 'America/Sao_Paulo' };
  // 09:00Z is 06:00 in São Paulo — outside 08:00–10:00
  assert.ok(availabilityViolation(spWindow, new Date('2026-09-14T09:00:00Z')));
});

test('describeAvailability: readable summary for error messages', () => {
  assert.equal(
    describeAvailability({ days: [1, 5], from: '08:00', to: '17:00' }),
    'Mon, Fri, 08:00–17:00'
  );
});
