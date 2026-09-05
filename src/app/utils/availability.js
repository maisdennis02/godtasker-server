// An offering's availability window: which weekdays and which hours (in the
// creator's timezone) a requester may choose as the start of the task.
// Shape: { days: number[] (0=Sun..6=Sat), from: "HH:MM", to: "HH:MM", tz: IANA }
// The mobile client mirrors this logic in features/offerings/availability.ts.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMinutes(hhmm) {
  const [, h, m] = TIME_RE.exec(hhmm);
  return Number(h) * 60 + Number(m);
}

function validTimeZone(tz) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Returns { value } with a normalised window (or null), or { error }.
export function parseAvailability(input) {
  if (input === undefined || input === null || input === '') return { value: null };
  if (typeof input !== 'object') return { error: 'Invalid availability' };

  const days = Array.isArray(input.days)
    ? [...new Set(input.days.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort()
    : [];
  if (!days.length) return { error: 'Availability needs at least one weekday' };

  const { from, to } = input;
  if (!TIME_RE.test(from || '') || !TIME_RE.test(to || '')) {
    return { error: 'Availability hours must be HH:MM' };
  }
  if (toMinutes(from) >= toMinutes(to)) {
    return { error: 'Availability must end after it starts' };
  }

  const tz = typeof input.tz === 'string' && validTimeZone(input.tz) ? input.tz : 'UTC';

  return { value: { days, from, to, tz } };
}

// Weekday (0-6) and minutes-since-midnight of `date` in the window's timezone.
function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  const weekday = DAY_NAMES.indexOf(get('weekday'));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { weekday, minutes };
}

// "Mon–Fri, 08:00–17:00" for error messages.
export function describeAvailability(a) {
  const days = a.days.map(d => DAY_NAMES[d]).join(', ');
  return `${days}, ${a.from}–${a.to}`;
}

// Null when `start` (and the end, if a duration is given) falls inside the
// window, otherwise a human-readable reason.
export function availabilityViolation(a, start, durationMinutes) {
  const { weekday, minutes } = localParts(start, a.tz);
  if (!a.days.includes(weekday)) {
    return `This offering is only available on ${describeAvailability(a)}`;
  }
  const from = toMinutes(a.from);
  const to = toMinutes(a.to);
  if (minutes < from || minutes > to) {
    return `This offering is only available on ${describeAvailability(a)}`;
  }
  if (durationMinutes && minutes + durationMinutes > to) {
    return `It must finish by ${a.to} — pick an earlier start`;
  }
  return null;
}
