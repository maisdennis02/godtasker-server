import User from '../models/User';

// The signed-in account, loaded from the token. Endpoints that used to trust a
// "me" email from the request body resolve it here instead, so nobody can act
// on someone else's behalf. Sends 401 and returns null when the account no
// longer exists (a deleted user's token still verifies until it expires).
export async function loadCurrentUser(req, res) {
  const me = await User.findByPk(req.userId);
  if (!me) {
    res.status(401).json({ error: 'Account not found' });
    return null;
  }
  return me;
}
