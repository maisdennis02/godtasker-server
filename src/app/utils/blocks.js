// `blocked_list` on a user holds the emails that user has blocked (the
// block/unblock endpoints' param names are historical — the client sends
// `email: me, blocker_email: target` and reads its own list as "people I
// blocked"). An interaction is forbidden when EITHER party has blocked the
// other, so a blocked user can't reach you and you can't reach them.
export function isBlockedBetween(a, b) {
  if (!a || !b) return false;
  const aList = a.blocked_list || [];
  const bList = b.blocked_list || [];
  return aList.includes(b.email) || bList.includes(a.email);
}
