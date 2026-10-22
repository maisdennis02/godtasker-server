// Inserts a small set of REAL offerings (no "[seed]" marker) for one account,
// so the Offerings feed has something genuine in it. Skips any entry whose
// name the account already has, so re-running is safe.
//
//   node scripts/create-my-offerings.js              # dry run: prints what would go in
//   node scripts/create-my-offerings.js --apply      # insert for user 28
//   node scripts/create-my-offerings.js --user=28 --apply
const { Sequelize } = require('sequelize');
const cfg = require('../src/config/database');

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const USER_ID = Number(opt('user') || 28);
const TZ = 'America/Sao_Paulo';
const WEEKDAYS = [1, 2, 3, 4, 5];

// Remote-friendly, in English (the testers are), things Dennis actually does.
const OFFERINGS = [
  {
    name: 'Test your Android closed test (14 days)',
    description:
      'Send me your Google Group and opt-in links. I install the same day, keep the app for the full 14 days and reply with a screenshot plus three lines of honest feedback.',
    price: 0,
    confirm_photo_option: 1,
    steps: ['Send me the group + opt-in links', 'I install and confirm with a screenshot', 'Day 14: I send feedback'],
    max_requests: 10,
  },
  {
    name: 'Portuguese conversation practice (30 min)',
    description:
      'Thirty minutes of relaxed Brazilian Portuguese over a video call, any level. Pick a topic or let me bring one. You get five corrections in writing afterwards.',
    price: 15,
    confirm_photo_option: 0,
    steps: ['Pick a topic', '30-minute call', 'I send your 5 corrections'],
    minutes: 30,
    window: [WEEKDAYS, '18:00', '21:00'],
  },
  {
    name: 'Code review of your side project (45 min)',
    description:
      'Share a repo link and what worries you. I read the code, write up the findings in order of importance, and we go through them on a short call.',
    price: 25,
    confirm_photo_option: 0,
    steps: ['Share the repo and your main worry', 'I read and write up findings', '15-minute call to go through them'],
    minutes: 45,
    window: [WEEKDAYS, '19:00', '22:00'],
  },
  {
    name: 'Feedback on your Play Store listing',
    description:
      'Send me your store listing link. I review the title, short description, screenshots and first paragraph, and send back the five changes that would matter most, in order.',
    price: 10,
    confirm_photo_option: 0,
    steps: ['Send the listing link', 'I review it', 'You get a prioritized list of 5 changes'],
  },
  {
    name: 'Playlist for your party (2 hours of music)',
    description:
      'Tell me the vibe, the crowd and three reference songs. I build a two-hour playlist that flows, and send you the link.',
    price: 20,
    confirm_photo_option: 0,
    steps: ['Tell me the vibe + 3 reference songs', 'I build the playlist', 'I send the link'],
  },
];

const subtasks = steps => steps.map((d, i) => ({ id: i + 1, description: d, complete: false, order: i }));

async function main() {
  const s = new Sequelize({ ...cfg, logging: false });
  console.log(`DB: ${cfg.database} @ ${cfg.host}`);
  const [[user]] = await s.query('SELECT id, user_name FROM users WHERE id = :id', { replacements: { id: USER_ID } });
  if (!user) throw new Error(`user ${USER_ID} not found`);
  const [existing] = await s.query(
    'SELECT name FROM offerings WHERE creator_id = :id AND canceled_at IS NULL',
    { replacements: { id: USER_ID } }
  );
  const have = new Set(existing.map(r => r.name));
  const todo = OFFERINGS.filter(o => !have.has(o.name));
  console.log(`user #${user.id} ${user.user_name}: has ${existing.length} live offerings, ${todo.length} to add`);
  for (const o of todo) console.log(`  + ${o.name}  (${o.price ? `$${o.price}` : 'free'}${o.minutes ? `, ${o.minutes} min` : ''})`);

  if (!flag('apply')) {
    console.log('\nDry run. Re-run with --apply to insert.');
    await s.close();
    return;
  }
  for (const o of todo) {
    await s.query(
      `INSERT INTO offerings
         (creator_id, name, description, sub_task_list, task_attributes, price,
          confirm_photo_option, tenure, display_in_profile,
          start_date, due_date, requester_sets_dates, max_requests,
          duration_minutes, availability, created_at, updated_at)
       VALUES
         (:creator_id, :name, :description, CAST(:sub_task_list AS json), NULL, :price,
          :confirm_photo_option, NULL, TRUE,
          NULL, NULL, :requester_sets_dates, :max_requests,
          :duration_minutes, CAST(:availability AS json), NOW(), NOW())`,
      {
        replacements: {
          creator_id: USER_ID,
          name: o.name,
          description: o.description,
          sub_task_list: JSON.stringify(subtasks(o.steps)),
          price: o.price,
          confirm_photo_option: o.confirm_photo_option,
          requester_sets_dates: !!o.window,
          max_requests: o.max_requests ?? null,
          duration_minutes: o.minutes ?? null,
          availability: o.window
            ? JSON.stringify({ days: o.window[0], from: o.window[1], to: o.window[2], tz: TZ })
            : null,
        },
      }
    );
  }
  console.log(`\nInserted ${todo.length} offerings.`);
  await s.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
