// Sends a few REAL, short tasks from one account (default: Dennis, id 28) to
// chosen testers, through the production API — exactly what the app does on
// "Send task" (same payload, same push, same socket event, same history).
// The only thing the script does with the DB is read the assignees' e-mails;
// the token is signed with the server's own APP_SECRET.
//
//   node scripts/send-real-tasks.js                 # dry run: prints what would be sent
//   node scripts/send-real-tasks.js --apply         # really send
//   node scripts/send-real-tasks.js --to=44,46 --apply
//   node scripts/send-real-tasks.js --from=28 --api=https://godtasker-api.onrender.com --apply
//
// Idempotent: skips a recipient that already has an open task with the same
// name from the same sender.
const path = require('path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const cfg = require(path.join(__dirname, '..', 'src/config/database.js'));

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt = (name, fallback = '') => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const APPLY = flag('apply');
const FROM = Number(opt('from', 28));
const API = opt('api', process.env.API_URL || 'https://godtasker-api.onrender.com').replace(/\/$/, '');
const DUE_DAYS = Number(opt('due', 3));

// What each tester gets. Short, doable inside the app, 3 steps, approval
// required so they see the full cycle (receive → start → done → approved).
const RATE_SCREEN = {
  name: 'Rate one LalaTask screen',
  description:
    "Two minutes, honest answer. Open two screens and tell me in our chat one thing you'd change. Any answer counts, including \"nothing\".",
  steps: ['Open the Offerings feed', "Open someone's profile", "Reply in our chat with one thing you'd change"],
};
const VOICE_MESSAGE = {
  name: 'Try a voice message',
  description:
    'Chat supports voice notes now. Open our chat, hold the mic button, say anything for five seconds and send it. Then mark this task done.',
  steps: ['Open our chat', 'Hold the mic and record 5 seconds', 'Mark this task done'],
};
const PLAN = {
  42: RATE_SCREEN, // shimengwang — opened the app today, never finished welcome 1
  44: VOICE_MESSAGE, // ggg — did everything else already
  46: RATE_SCREEN, // alvin — welcome 2 still pending
};
const TO = opt('to') ? opt('to').split(',').map(Number) : Object.keys(PLAN).map(Number);

const subtasks = steps => steps.map((d, i) => ({ id: i + 1, description: d, complete: false, order: i }));
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);

async function main() {
  if (!process.env.APP_SECRET) throw new Error('APP_SECRET is not set; cannot sign a token');
  const db = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.dialectOptions && cfg.dialectOptions.ssl ? { rejectUnauthorized: false } : false,
  });
  await db.connect();
  console.log(`DB: ${cfg.database} @ ${cfg.host}  |  API: ${API}  |  ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const { rows: users } = await db.query(
    'SELECT id, user_name, email, notification_token IS NOT NULL AS has_push FROM users WHERE id = ANY($1) AND canceled_at IS NULL',
    [[FROM, ...TO]]
  );
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const sender = byId[FROM];
  if (!sender) throw new Error(`sender ${FROM} not found`);

  const { rows: open } = await db.query(
    "SELECT assignee_id, name FROM tasks WHERE requester_id = $1 AND canceled_at IS NULL AND end_date IS NULL",
    [FROM]
  );
  const already = new Set(open.map(t => `${t.assignee_id}|${t.name}`));
  await db.end();

  const token = jwt.sign({ id: FROM }, process.env.APP_SECRET, { expiresIn: '10m' });
  const now = new Date();

  for (const id of TO) {
    const to = byId[id];
    const copy = PLAN[id] || RATE_SCREEN;
    if (!to) {
      console.log(`- ${id}: SKIP (no such active user)`);
      continue;
    }
    if (already.has(`${id}|${copy.name}`)) {
      console.log(`- ${id} ${to.user_name}: SKIP (already has "${copy.name}")`);
      continue;
    }
    const payload = {
      assignee_email: to.email,
      name: copy.name,
      description: copy.description,
      sub_task_list: subtasks(copy.steps),
      confirm_photo: false,
      approval_required: true,
      start_date: now.toISOString(),
      due_date: addDays(now, DUE_DAYS).toISOString(),
    };
    console.log(
      `- ${id} ${to.user_name} (push: ${to.has_push ? 'yes' : 'no'}): "${copy.name}" due in ${DUE_DAYS}d, approval required`
    );
    if (!APPLY) continue;
    const res = await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`POST /tasks for ${id} failed: ${res.status} ${JSON.stringify(body)}`);
    console.log(`    sent → task ${body.id}`);
  }
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to send.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
