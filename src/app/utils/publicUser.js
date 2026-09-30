// What one account may see of another. People pick what goes on their
// profile (name, occupation, bio, links); contact and personal details, and
// who they blocked, stay with the owner. `email` stays because follow, chat,
// block and report are all keyed by it.
const PRIVATE_FIELDS = [
  'phonenumber',
  'birth_date',
  'gender',
  'hint',
  'locale',
  'blocked_list',
  'flag_count',
];

// `viewer` is the signed-in user ({ id, email }). Your own record comes back
// whole; anyone else's loses the private fields, and its report list is cut
// down to "did I report this person" so reporters stay anonymous.
export function publicUser(user, viewer) {
  if (!user) return user;
  const values = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  if (viewer && values.id === viewer.id) return values;
  PRIVATE_FIELDS.forEach(field => delete values[field]);
  const reportedByViewer =
    !!viewer && (values.flagged_list || []).includes(viewer.email);
  values.flagged_list = reportedByViewer ? [viewer.email] : [];
  return values;
}

export function publicUsers(users, viewer) {
  return users.map(user => publicUser(user, viewer));
}
