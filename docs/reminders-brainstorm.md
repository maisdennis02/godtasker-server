# Task reminders (start / due) — brainstorm

Status: exploration, nothing built. Written 2026-09-05 so we can pick an approach.

## What we want

Push the right person at the right moment around a task's schedule:

| Moment | Who | Example text |
| --- | --- | --- |
| Before start (e.g. 1 h) | assignee | "Dog walk starts in 1 hour" |
| At start | assignee (requester optional) | "Dog walk starts now" |
| Before due (e.g. 24 h, 1 h) | assignee | "Grocery run is due tomorrow at 10:00" |
| At due / overdue | assignee + requester | "Grocery run was due 10:00 and isn't done" |
| Event with seats (offering) | every requester | "Yoga class starts tomorrow 09:00" |

Tapping the notification should deep-link to the task.

## What already exists

`src/lib/approvalOverdueNotifier.js` is a working scheduler pattern: an in-process
`setInterval` every 30 min that queries tasks crossing a threshold, stamps a
`*_notified_at` column first, then sends FCM. It runs on the single Render
instance and survives restarts because the stamp lives in the DB.

The mobile app already has the FCM plumbing (token stored on `users`,
foreground bridge, channel `godtaskerChannel01`).

## Options

### A. Extend the interval scanner (stamp columns)

Add `start_reminder_sent_at`, `due_reminder_sent_at`, `overdue_notified_at`
to tasks. A 1-minute interval runs queries like
`start_date BETWEEN now AND now + 60min AND start_reminder_sent_at IS NULL`.

- Simple, matches existing code, zero new infrastructure.
- One column per reminder kind: adding "24 h before due" means another column and another query. Rigid.
- Editing a date after the reminder fired can't re-arm it without clearing stamps by hand.
- Fine for 2–3 fixed reminders. Gets ugly past that.

### B. A `reminders` table (recommended)

```
reminders
  id, task_id, kind ('start_soon' | 'start' | 'due_soon' | 'due' | 'overdue'),
  recipient_id, send_at, sent_at, created_at
  index (sent_at, send_at)
```

Rows are created whenever a task's dates are set or changed: task create/update,
offering request, reopen. On a date change, delete the task's unsent rows and
recreate them. A scanner every minute does

```sql
SELECT ... FROM reminders
WHERE sent_at IS NULL AND send_at <= now()
ORDER BY send_at LIMIT 100
FOR UPDATE SKIP LOCKED
```

marks `sent_at`, sends the push. `SKIP LOCKED` makes it safe if Render ever
runs two instances.

- Any number of reminder kinds without schema changes.
- `send_at` is absolute UTC computed from the task dates, so timezones never
  enter the scanner. The creator's timezone only matters when we *display*.
- Cheap to add per-user preferences later ("remind me 2 h before, not 1 h") by
  reading prefs when rows are generated.
- Cancelled / completed tasks: delete their unsent rows in the same code path
  that cancels or completes them (or skip at send time if `end_date`/
  `canceled_at` is set — belt and braces).
- Downside: one more table and one more code path to keep in sync.

### C. Cron job hitting an endpoint

Render Cron Job (or GitHub Actions) calls `POST /internal/reminders/run` every
minute with a secret header. Same logic as B behind the endpoint.

- Decouples scheduling from the web process; works even if we later move to
  a platform that sleeps idle services.
- Render cron jobs cost extra and 1-minute granularity is the floor.
- Only worth it if the in-process timer proves unreliable. Not now.

### D. Device-local scheduled notifications

`expo-notifications` can schedule local notifications on the phone when the
task list loads.

- Works offline, no server work.
- Falls apart on multiple devices, on the web client, when dates change while
  the app is closed, and for the requester side. Also can't be audited.
- Maybe as a *supplement* for the assignee's own "starts in 10 min", never as
  the primary mechanism.

## Recommendation

Go with **B**, scanner in-process like the existing notifier (1-minute tick,
`timer.unref()`), and keep C as the escape hatch if we outgrow one instance.

Default reminder set for v1 (no preferences UI yet):

- `start_soon`: start − 60 min → assignee
- `due_soon`: due − 24 h → assignee (only if due − start > 24 h, otherwise skip)
- `due`: at due → assignee and requester if still open
- `overdue`: due + 24 h → requester (mirrors the approval nag)

Skip a row at send time if the task is done, cancelled, or the date has moved
(compare `send_at` against a recomputed value, or just rely on the
delete-and-recreate on update).

## Open questions

1. Quiet hours: suppress pushes between 22:00–07:00 in the *recipient's*
   timezone? Needs a `users.timezone` column (the app can send
   `Intl.DateTimeFormat().resolvedOptions().timeZone` on login).
2. Recurring offerings (a weekly class) would need recurring rows; out of
   scope until offerings themselves can recur.
3. Digest vs individual: someone with 15 tasks due tomorrow gets 15 pushes at
   the same minute. A per-user batch ("15 tasks due tomorrow") is a later
   refinement of the scanner, not a schema change.
4. Push text language: server pushes are English today; the client-supplied
   text convention (`messageTitle`/`messageMessage`) doesn't apply to
   server-originated reminders. Either store the user's language on `users`
   or send `data`-only pushes and let the app render the text.

## Rough size

- Migration + model: small.
- Row generation in 4 code paths (task store/update, offering request,
  reopen) + cleanup on cancel/complete: medium.
- Scanner + FCM send + deep link data: small, copy the existing notifier.
- Mobile: handle the deep link (`data.task_id`) on notification tap: small.
