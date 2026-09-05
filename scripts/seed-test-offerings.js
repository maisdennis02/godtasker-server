#!/usr/bin/env node
// Seed a few realistic offerings for every user EXCEPT the Play Store
// reviewer account, so the "Browse" side of the Offerings tab has something
// to request during testing.
//
// Usage (from godTaskerServer1-2, uses the same DB config as the server):
//   node scripts/seed-test-offerings.js --dry-run        # list who would get what
//   node scripts/seed-test-offerings.js                   # insert
//   node scripts/seed-test-offerings.js --force           # also for users who already have offerings
//   node scripts/seed-test-offerings.js --exclude=foo@x   # extra users to skip (comma-separated id/email/name)
//
// Idempotent by default: a user who already has an active offering is skipped.
// Everything inserted carries the marker "[seed]" at the end of the
// description so it can be found and removed later:
//   node scripts/seed-test-offerings.js --clean
// Replace the previous seed in one go (clean + insert for everyone):
//   node scripts/seed-test-offerings.js --reseed
// Read-only: report whether the schedule/capacity migration has run here:
//   node scripts/seed-test-offerings.js --check
//
// Schedule per catalog entry: `fixed: [dayOffset, startHour, durationHours]`
// gives the offering creator-set start/due dates that many days from now;
// `requesterDates: true` lets the requester pick; neither = no schedule.
// `seats` sets max_requests (undefined = unlimited).

const { Sequelize } = require('sequelize');
const cfg = require('../src/config/database');

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const SEED_MARK = '[seed]';
const REVIEWER_PATTERNS = ['review', 'google', 'play'];

// Each user gets a rotating slice of this catalog so profiles don't all look
// identical. Sub-task rows follow the mobile buildSubtasks() shape.
const CATALOG = [
  {
    name: 'Grocery run',
    description:
      'I will pick up your weekly groceries from the nearest supermarket and drop them at your door.',
    price: 35,
    confirm_photo_option: 1,
    steps: ['Get the shopping list', 'Buy everything on the list', 'Deliver and send receipt photo'],
    requesterDates: true,
  },
  {
    name: 'Dog walk (30 min)',
    description: 'Half-hour walk around the block, water refill included.',
    price: 20,
    confirm_photo_option: 1,
    steps: ['Pick up the dog', 'Walk 30 minutes', 'Refill water bowl'],
    requesterDates: true,
  },
  {
    name: 'Yoga class (group)',
    description: 'One-hour beginner-friendly session in the park. Bring a mat and water.',
    price: 15,
    confirm_photo_option: 0,
    steps: ['Arrive 10 minutes early', 'Warm-up', 'Main flow', 'Cool-down'],
    fixed: [7, 9, 1],
    seats: 8,
  },
  {
    name: 'Fix a leaky faucet',
    description: 'Basic plumbing: replace washers or cartridge on a kitchen or bathroom tap.',
    price: 60,
    confirm_photo_option: 1,
    steps: ['Inspect the faucet', 'Replace worn parts', 'Test for leaks'],
    requesterDates: true,
  },
  {
    name: 'Portuguese conversation (1h)',
    description: 'One hour of casual Portuguese practice over a call. All levels welcome.',
    price: 25,
    confirm_photo_option: 0,
    steps: ['Agree on a time', 'One-hour call', 'Send vocabulary notes'],
    requesterDates: true,
    seats: 5,
  },
  {
    name: 'Guitar lesson (beginner)',
    description: 'First chords, strumming and one full song by the end of the hour. One student at a time.',
    price: 40,
    confirm_photo_option: 0,
    steps: ['Tune the guitar', 'Learn 3 chords', 'Play a song'],
    fixed: [3, 18, 1],
    seats: 1,
  },
  {
    name: 'Assemble flat-pack furniture',
    description: 'Bring your box, I bring the tools. Shelves, desks, wardrobes.',
    price: 80,
    confirm_photo_option: 1,
    steps: ['Unpack and sort parts', 'Assemble', 'Photo of the finished piece'],
    requesterDates: true,
  },
  {
    name: 'Resume review',
    description: 'I will proofread your resume and suggest wording and layout improvements.',
    price: 30,
    confirm_photo_option: 0,
    steps: ['Receive the current resume', 'Review and annotate', 'Return the edited version'],
  },
  {
    name: 'Cooking workshop: pasta from scratch',
    description: 'Hands-on evening class. Flour, eggs and aprons provided; you take the pasta home.',
    price: 50,
    confirm_photo_option: 1,
    steps: ['Make the dough', 'Roll and cut', 'Cook and plate', 'Photo of your dish'],
    fixed: [10, 19, 3],
    seats: 6,
  },
  {
    name: 'Car wash at your place',
    description: 'Exterior wash and interior vacuum, at your address.',
    price: 45,
    confirm_photo_option: 1,
    steps: ['Exterior wash', 'Interior vacuum', 'Before/after photos'],
    requesterDates: true,
  },
  {
    name: 'Plant sitting (per week)',
    description: 'Watering and light check for your plants while you travel.',
    price: 15,
    confirm_photo_option: 1,
    steps: ['Get watering instructions', 'Visit every other day', 'Send a photo each visit'],
    requesterDates: true,
    seats: 3,
  },
  {
    name: 'Neighborhood cleanup morning',
    description: 'Two hours picking up litter along the river path. Gloves and bags provided.',
    price: 0,
    confirm_photo_option: 1,
    steps: ['Meet at the bridge', 'Cleanup', 'Group photo with the bags'],
    fixed: [14, 8, 2],
    seats: 20,
  },
];

// Creator-set schedule: `days` from now at `hour` local time, lasting `hours`.
function fixedDates([days, hour, hours]) {
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(hour, 0, 0, 0);
  const due = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return { start, due };
}

const PER_USER = 3;

function subtasks(steps) {
  return steps.map((d, i) => ({ id: i + 1, description: d, complete: false, order: i }));
}

function looksLikeReviewer(u) {
  const hay = `${u.user_name || ''} ${u.email || ''}`.toLowerCase();
  return REVIEWER_PATTERNS.some(p => hay.includes(p));
}

async function main() {
  const s = new Sequelize({ ...cfg, logging: false });
  const dry = flag('dry-run');
  const reseed = flag('reseed');
  const force = flag('force') || reseed;
  const extraExclude = opt('exclude')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

  console.log(`DB: ${cfg.database} @ ${cfg.host}`);

  if (flag('check')) {
    const [cols] = await s.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'offerings' AND column_name IN ('start_date','due_date','requester_sets_dates','max_requests')"
    );
    const [mig] = await s.query(
      'SELECT name FROM "SequelizeMeta" ORDER BY name DESC LIMIT 1'
    );
    console.log(`offerings schedule columns present: ${cols.length}/4`);
    console.log(`latest migration: ${mig[0] ? mig[0].name : 'none'}`);
    await s.close();
    return;
  }

  if (flag('clean') || (reseed && !dry)) {
    const [, meta] = await s.query(
      'DELETE FROM offerings WHERE description LIKE :mark',
      { replacements: { mark: `%${SEED_MARK}` } }
    );
    console.log(`Removed ${meta.rowCount ?? meta} seeded offerings.`);
    if (!reseed) {
      await s.close();
      return;
    }
  }
  if (reseed) {
    const [[{ n }]] = await s.query(
      'SELECT COUNT(*)::int AS n FROM offerings WHERE canceled_at IS NULL AND description NOT LIKE :mark',
      { replacements: { mark: `%${SEED_MARK}` } }
    );
    if (n) console.log(`Note: ${n} non-seeded offering(s) exist and are left alone.`);
  }

  const [users] = await s.query(
    'SELECT id, user_name, email FROM users ORDER BY id'
  );
  const [existing] = await s.query(
    'SELECT creator_id, COUNT(*)::int AS n FROM offerings WHERE canceled_at IS NULL GROUP BY creator_id'
  );
  const existingCount = Object.fromEntries(existing.map(r => [r.creator_id, r.n]));

  const rows = [];
  let cursor = 0;
  for (const u of users) {
    const key = [String(u.id), (u.email || '').toLowerCase(), (u.user_name || '').toLowerCase()];
    const reason = looksLikeReviewer(u)
      ? 'play reviewer'
      : extraExclude.some(x => key.includes(x))
      ? 'excluded'
      : !force && existingCount[u.id]
      ? `already has ${existingCount[u.id]}`
      : null;

    if (reason) {
      console.log(`skip  #${u.id} ${u.user_name} <${u.email}>  (${reason})`);
      continue;
    }

    const picks = [];
    for (let i = 0; i < PER_USER; i += 1) {
      picks.push(CATALOG[(cursor + i) % CATALOG.length]);
    }
    cursor += PER_USER;

    const label = p =>
      `${p.name}${p.seats ? ` [${p.seats} seats]` : ''}${p.fixed ? ' [fixed dates]' : p.requesterDates ? ' [requester dates]' : ''}`;
    console.log(`seed  #${u.id} ${u.user_name} <${u.email}>  -> ${picks.map(label).join(' | ')}`);
    for (const p of picks) {
      const dates = p.fixed ? fixedDates(p.fixed) : null;
      rows.push({
        creator_id: u.id,
        name: p.name,
        description: `${p.description} ${SEED_MARK}`,
        sub_task_list: JSON.stringify(subtasks(p.steps)),
        price: p.price,
        confirm_photo_option: p.confirm_photo_option,
        display_in_profile: true,
        start_date: dates ? dates.start : null,
        due_date: dates ? dates.due : null,
        requester_sets_dates: !!p.requesterDates,
        max_requests: p.seats ?? null,
      });
    }
  }

  if (dry) {
    console.log(`\nDry run: would insert ${rows.length} offerings.`);
    await s.close();
    return;
  }
  if (!rows.length) {
    console.log('Nothing to insert.');
    await s.close();
    return;
  }

  for (const r of rows) {
    await s.query(
      `INSERT INTO offerings
         (creator_id, name, description, sub_task_list, task_attributes, price,
          confirm_photo_option, tenure, display_in_profile,
          start_date, due_date, requester_sets_dates, max_requests,
          created_at, updated_at)
       VALUES
         (:creator_id, :name, :description, CAST(:sub_task_list AS json), NULL, :price,
          :confirm_photo_option, NULL, :display_in_profile,
          :start_date, :due_date, :requester_sets_dates, :max_requests,
          NOW(), NOW())`,
      { replacements: r }
    );
  }
  console.log(`\nInserted ${rows.length} offerings.`);
  await s.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
