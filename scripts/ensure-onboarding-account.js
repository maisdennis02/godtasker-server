// Creates (or repairs) the "LalaTask" onboarding account that sends every new
// user their welcome task (src/lib/onboarding.js). Idempotent: safe to re-run.
//   node scripts/ensure-onboarding-account.js            # against the configured DB
//   node scripts/ensure-onboarding-account.js --icon /path/to/icon.png
// Uses the same env as the server (dotenv): DATABASE_URL or DB_*, AWS_* for the avatar.
require('dotenv/config');
require('sucrase/register');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const db = require('../src/database').default;
const User = require('../src/app/models/User').default;
const File = require('../src/app/models/File').default;
const s3 = require('../src/config/s3').default;
const { ONBOARDING_SENDER_EMAIL } = require('../src/lib/onboarding');

const iconArg = process.argv.indexOf('--icon');
const ICON = iconArg > -1 ? process.argv[iconArg + 1] : path.resolve(__dirname, '../logo.png');

(async () => {
  let user = await User.findOne({ where: { email: ONBOARDING_SENDER_EMAIL } });
  if (!user) {
    user = await User.create({
      email: ONBOARDING_SENDER_EMAIL,
      user_name: 'LalaTask',
      first_name: 'LalaTask',
      // Nobody logs in as this account; a random password keeps it unusable.
      password: crypto.randomBytes(24).toString('base64url'),
      bio: 'Official LalaTask account. Sends the welcome task to new users. Questions: support@lalatask.com',
      points: 0,
    });
    console.log('created onboarding account id', user.id);
  } else {
    console.log('onboarding account exists, id', user.id);
  }

  if (!user.avatar_id) {
    const body = fs.readFileSync(ICON);
    const key = `lalatask-avatar-${Date.now()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET,
        Key: key,
        Body: body,
        ContentType: 'image/png',
      })
    );
    const file = await File.create({
      name: key,
      path: `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
    await user.update({ avatar_id: file.id });
    console.log('avatar set from', ICON, '->', file.url);
  } else {
    console.log('avatar already set');
  }
  await db.connection.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
