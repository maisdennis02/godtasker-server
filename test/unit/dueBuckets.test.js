const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  countDueDates,
  resolveTimeZone,
  DEFAULT_TIME_ZONE,
} = require('../../src/app/utils/dueBuckets');

// 22:30 in São Paulo on Monday 14/09 is already 01:30 UTC on Tuesday 15/09.
const now = new Date('2026-09-15T01:30:00Z');
const dates = [
  '2026-09-15T01:00:00Z', // 22:00 SP — already past
  '2026-09-15T02:30:00Z', // 23:30 SP, still today
  '2026-09-15T15:00:00Z', // 12:00 SP tomorrow (but still "today" in UTC)
  '2026-09-16T12:00:00Z', // later this week
  null,
  'garbage',
];

test('countDueDates: today/tomorrow are calendar days in the viewer time zone', () => {
  assert.deepEqual(countDueDates(dates, now, 'America/Sao_Paulo'), {
    overDue: 1,
    todayDue: 1,
    tomorrowDue: 1,
    thisWeekDue: 3,
  });
  assert.deepEqual(countDueDates(dates, now, 'UTC'), {
    overDue: 1,
    todayDue: 2,
    tomorrowDue: 1,
    thisWeekDue: 3,
  });
});

test('countDueDates: missing dates are never overdue; empty input is all zeros', () => {
  assert.deepEqual(countDueDates([null, undefined], now), {
    overDue: 0,
    todayDue: 0,
    tomorrowDue: 0,
    thisWeekDue: 0,
  });
  assert.deepEqual(countDueDates([], now).overDue, 0);
});

test('resolveTimeZone: valid IANA names pass, anything else falls back', () => {
  assert.equal(resolveTimeZone('Asia/Tokyo'), 'Asia/Tokyo');
  assert.equal(resolveTimeZone('Not/AZone'), DEFAULT_TIME_ZONE);
  assert.equal(resolveTimeZone(undefined), DEFAULT_TIME_ZONE);
  assert.equal(resolveTimeZone(['UTC']), DEFAULT_TIME_ZONE);
});
