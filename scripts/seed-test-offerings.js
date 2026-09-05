#!/usr/bin/env node
/* eslint-disable no-console */
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
  },
  {
    name: 'Dog walk (30 min)',
    description: 'Half-hour walk around the block, water refill included.',
    price: 20,
    confirm_photo_option: 1,
    steps: ['Pick up the dog', 'Walk 30 minutes', 'Refill water bowl'],
  },
  {
    name: 'Fix a leaky faucet',
    description: 'Basic plumbing: replace washers or cartridge on a kitchen or bathroom tap.',
    price: 60,
    confirm_photo_option: 1,
    steps: ['Inspect the faucet', 'Replace worn parts', 'Test for leaks'],
  },
  {
    name: 'Portuguese conversation (1h)',
    description: 'One hour of casual Portuguese practice over a call. All levels welcome.',
    price: 25,
    confirm_photo_option: 0,
    steps: ['Agree on a time', 'One-hour call', 'Send vocabulary notes'],
  },
  {
    name: 'Assemble flat-pack furniture',
    description: 'Bring your box, I bring the tools. Shelves, desks, wardrobes.',
    price: 80,
    confirm_photo_option: 1,
    steps: ['Unpack and sort parts', 'Assemble', 'Photo of the finished piece'],
  },
  {
    name: 'Resume review',
    description: 'I will proofread your resume and suggest wording and layout improvements.',
    price: 30,
    confirm_photo_option: 0,
    steps: ['Receive the current resume', 'Review and annotate', 'Return the edited version'],
  },
  {
    name: 'Car wash at your place',
    description: 'Exterior wash and interior vacuum, at your address.',
    price: 45,
    confirm_photo_option: 1,
    steps: ['Exterior wash', 'Interior vacuum', 'Before/after photos'],
  },
  {
    name: 'Plant sitting (per week)',
    description: 'Watering and light check for your plants while you travel.',
    price: 15,
    confirm_photo_option: 1,
    steps: ['Get watering instructions', 'Visit every other day', 'Send a photo each visit'],
  },
  {
    name: 'Guitar lesson (beginner)',
    description: 'First chords, strumming and one full song by the end of the hour.',
    price: 40,
    confirm_photo_option: 0,
    steps: ['Tune the guitar', 'Learn 3 chords', 'Play a song'],
  },
];

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
  const force = flag('force');
  const extraExclude = opt('exclude')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

  console.log(`DB: ${cfg.database} @ ${cfg.host}`);

  if (flag('clean')) {
    const [, meta] = await s.query(
      'DELETE FROM offerings WHERE description LIKE :mark',
      { replacements: { mark: `%${SEED_MARK}` } }
    );
    console.log(`Removed ${meta.rowCount ?? meta} seeded offerings.`);
    await s.close();
    return;
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

    console.log(`seed  #${u.id} ${u.user_name} <${u.email}>  -> ${picks.map(p => p.name).join(' | ')}`);
    for (const p of picks) {
      rows.push({
        creator_id: u.id,
        name: p.name,
        description: `${p.description} ${SEED_MARK}`,
        sub_task_list: JSON.stringify(subtasks(p.steps)),
        task_attributes: null,
        price: p.price,
        confirm_photo_option: p.confirm_photo_option,
        tenure: null,
        display_in_profile: true,
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
          confirm_photo_option, tenure, display_in_profile, created_at, updated_at)
       VALUES
         (:creator_id, :name, :description, CAST(:sub_task_list AS json), NULL, :price,
          :confirm_photo_option, NULL, :display_in_profile, NOW(), NOW())`,
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
