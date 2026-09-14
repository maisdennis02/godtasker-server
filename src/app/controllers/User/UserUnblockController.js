import { loadCurrentUser } from '../../utils/currentUser';
// -----------------------------------------------------------------------------
class UserUnblockController {
  // Unblock someone from the signed-in user's own list. `unblocker_email` is
  // the person being unblocked; an `email` in the body is ignored. The target
  // need not exist any more — a deleted account must still be removable.
  async update(req, res) {
    const { unblocker_email: targetEmail } = req.body;

    const me = await loadCurrentUser(req, res);
    if (!me) return null;

    // New array (filtered) so Sequelize persists the change.
    const blocked_list = (me.blocked_list ?? []).filter(e => e !== targetEmail);

    await me.update({ blocked_list });

    return res.json(me);
  }
}
export default new UserUnblockController();
