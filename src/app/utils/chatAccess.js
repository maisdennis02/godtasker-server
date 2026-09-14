// A conversation belongs to the two emails on its header (`user_email` and
// `worker_email` are historical names for "one side" and "the other side").
// Every read or write by chat id must be limited to them, otherwise any
// signed-in account can read or post into any conversation by guessing the id.
export function isChatParty(header, email) {
  if (!header || !email) return false;
  return header.user_email === email || header.worker_email === email;
}

export function otherParty(header, email) {
  return header.user_email === email ? header.worker_email : header.user_email;
}
