// READ-ONLY report of tester activity. Prints ids, user names and counts only — never e-mails.
// Usage (from the server folder): node scripts/tester-activity.js
const path = require('path');
const cfg = require(path.join(__dirname, '..', 'src/config/database.js'));
const { Client } = require('pg');

(async () => {
  const make = () => new Client({
    host: cfg.host, port: cfg.port, user: cfg.username, password: cfg.password,
    database: cfg.database, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  // Neon's free tier suspends when idle; the first connection often drops while it wakes up.
  let c;
  for (let attempt = 1; ; attempt++) {
    c = make();
    try { await c.connect(); await c.query('select 1'); break; } catch (e) {
      try { await c.end(); } catch (_) { /* ignore */ }
      if (attempt >= 4) throw e;
      console.error(`connect attempt ${attempt} failed (${e.message}), retrying…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '-');

  const users = await q(`
    select u.id, u.user_name, u.first_name, u.locale, u.google_id is not null as google,
           u.notification_token is not null as push, u.created_at as created,
           (select count(*) from tasks t where t.requester_id=u.id and t.requester_id<>t.assignee_id) as sent,
           (select count(*) from tasks t where t.assignee_id=u.id and t.requester_id<>t.assignee_id) as received,
           (select count(*) from tasks t where t.assignee_id=u.id and t.initiated_at is not null) as started,
           (select count(*) from tasks t where t.assignee_id=u.id and t.end_date is not null) as finished,
           (select count(*) from tasks t where t.requester_id=u.id and t.assignee_id=u.id) as self_tasks,
           (select max(t.updated_at) from tasks t where t.requester_id=u.id or t.assignee_id=u.id) as last_task_touch,
           (select count(*) from chat_messages m where m.sender_email=u.email) as chat_sent,
           (select max(m.created_at) from chat_messages m where m.sender_email=u.email) as last_chat,
           (select count(*) from offerings o where o.creator_id=u.id) as offerings
    from users u where u.canceled_at is null order by u.id`);

  console.log('id | user_name | first | loc | google | push | created | sent | recv | started | finished | self | lastTask | chat | lastChat | offers');
  for (const u of users) {
    console.log([u.id, u.user_name, u.first_name, u.locale || '-', u.google ? 'G' : '-', u.push ? 'P' : '-', d(u.created),
      u.sent, u.received, u.started, u.finished, u.self_tasks, d(u.last_task_touch), u.chat_sent, d(u.last_chat), u.offerings].join(' | '));
  }

  const tot = await q(`select count(*) total,
    count(*) filter (where created_at > '2026-09-30') since_vc18,
    count(*) filter (where end_date is not null) done,
    count(*) filter (where requester_id = 37) onboarding from tasks`);
  console.log('\nTASKS', tot[0]);

  const recent = await q(`select t.id, t.requester_id rq, t.assignee_id asg, left(t.name, 30) name, t.created_at c,
    t.initiated_at is not null st, t.end_date is not null dn, t.approval_required ap
    from tasks t where t.created_at > '2026-09-14' order by t.id`);
  console.log('\nRECENT TASKS (since 14/09): id | rq | asg | name | created | started | done | approval');
  for (const r of recent) console.log([r.id, r.rq, r.asg, r.name, d(r.c), r.st ? 'y' : '-', r.dn ? 'y' : '-', r.ap ? 'y' : '-'].join(' | '));

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
