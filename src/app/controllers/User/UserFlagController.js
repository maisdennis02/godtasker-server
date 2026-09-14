import { Op } from 'sequelize';
import User from '../../models/User';
import { loadCurrentUser } from '../../utils/currentUser';
// -----------------------------------------------------------------------------
class UserFlagController {
  async index(req, res) {
    const users = await User.findAll({
      where: {
        flag_count: {
          [Op.gte]: 1,
        },
      },
    });

    return res.json(users);
  }

  // ---------------------------------------------------------------------------
  // Report `email`. The reporter is always the signed-in user; a
  // `flagger_email` in the body is ignored, so reports can't be forged.
  async update(req, res) {
    const { email } = req.body;

    const me = await loadCurrentUser(req, res);
    if (!me) return null;
    if (email === me.email) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }

    const user = await User.findOne({
      where: { email },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const current = user.flagged_list ?? [];

    // Don't let the same person flag twice — keeps flag_count meaningful.
    if (current.includes(me.email)) {
      return res.json(user);
    }

    // New array so Sequelize persists the change.
    const flagged_list = [...current, me.email];
    const flag_count = (user.flag_count ?? 0) + 1;

    await user.update({ flag_count, flagged_list });

    return res.json(user);
  }
}
export default new UserFlagController();
