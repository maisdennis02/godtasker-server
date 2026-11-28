import User from '../models/User';

// user_name is what other people see. Social sign-ins (Google, Apple) have no
// "pick a username" step, so derive a sane default from the profile and make it
// unique with a numeric suffix if it's taken.
export async function uniqueUserName(seed) {
  const base =
    String(seed || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'user';
  let candidate = base;
  for (let i = 0; await User.findOne({ where: { user_name: candidate } }); i += 1) {
    candidate = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    if (i > 20) break; // practically unreachable; keep a hard stop anyway
  }
  return candidate;
}
