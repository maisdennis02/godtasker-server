import { Op } from 'sequelize';
import User from '../../models/User';
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
  async update(req, res) {
    const { email, blocker_email } = req.body;

    const user = await User.findOne({
      where: { email },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Build a NEW array so Sequelize detects the change (in-place mutation of a
    // Postgres ARRAY column is not tracked). Skip duplicates.
    const current = user.blocked_list ?? [];
    const blocked_list = current.includes(blocker_email)
      ? current
      : [...current, blocker_email];

    await user.update({ blocked_list });

    return res.json(user);
  }
}
export default new UserBlockController();
