import { Op } from 'sequelize';
import User from '../../models/User';
import { loadCurrentUser } from '../../utils/currentUser';
// -----------------------------------------------------------------------------
class UserBlockController {
  async index(req, res) {
    const users = await User.findAll({
      where: {
        blocked_list: {
          [Op.ne]: [],
        },
      },
    });

    return res.json(users);
  }

  // ---------------------------------------------------------------------------
  // Block someone. The blocker is always the signed-in user; `blocker_email`
  // (historical name, see utils/blocks.js) is the person being blocked. An
  // `email` in the body is ignored, so nobody can edit another user's list.
  async update(req, res) {
    const { blocker_email: targetEmail } = req.body;
    if (!targetEmail) {
      return res.status(400).json({ error: 'blocker_email is required' });
    }

    const me = await loadCurrentUser(req, res);
    if (!me) return null;
    if (targetEmail === me.email) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    const target = await User.findOne({ where: { email: targetEmail } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Build a NEW array so Sequelize detects the change (in-place mutation of a
    // Postgres ARRAY column is not tracked). Skip duplicates.
    const current = me.blocked_list ?? [];
    const blocked_list = current.includes(targetEmail)
      ? current
      : [...current, targetEmail];

    await me.update({ blocked_list });

    return res.json(me);
  }
}
export default new UserBlockController();
