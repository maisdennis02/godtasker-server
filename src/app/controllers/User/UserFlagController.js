import { Op } from 'sequelize';
import User from '../../models/User';
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
  async update(req, res) {
    const { email, flagger_email } = req.body;

    const user = await User.findOne({
      where: { email },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const current = user.flagged_list ?? [];

    // Don't let the same person flag twice — keeps flag_count meaningful.
    if (current.includes(flagger_email)) {
      return res.json(user);
    }

    // New array so Sequelize persists the change.
    const flagged_list = [...current, flagger_email];
    const flag_count = (user.flag_count ?? 0) + 1;

    await user.update({ flag_count, flagged_list });

    return res.json(user);
  }
}
export default new UserFlagController();
