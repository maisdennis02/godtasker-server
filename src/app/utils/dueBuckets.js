import { endOfISOWeek } from 'date-fns';

// Due-date tiles on the dashboards. "Today" and "tomorrow" are calendar days in
// the viewer's time zone (clients send ?tz=): the server runs in UTC, where a
// Brazilian evening already belongs to the next day.
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export function resolveTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '') return DEFAULT_TIME_ZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function nextDayKey(key) {
  const day = new Date(`${key}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

// overDue, todayDue and tomorrowDue are disjoint (a task due this morning is
// overdue, not "due today"); thisWeekDue is everything still ahead until the
// end of the ISO week. Missing or invalid dates count nowhere.
export function countDueDates(
  dueDates,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  // en-CA formats as YYYY-MM-DD, so day keys compare as plain strings.
  const format = Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = format.format(now);
  const tomorrow = nextDayKey(today);
  const weekEnd = endOfISOWeek(now);
  const counts = { overDue: 0, todayDue: 0, tomorrowDue: 0, thisWeekDue: 0 };

  dueDates.forEach(value => {
    if (value == null) return;
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return;

    if (due < now) {
      counts.overDue += 1;
      return;
    }
    const key = format.format(due);
    if (key === today) counts.todayDue += 1;
    else if (key === tomorrow) counts.tomorrowDue += 1;
    if (due < weekEnd) counts.thisWeekDue += 1;
  });

  return counts;
}
