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

    let user_blocked_list = user.blocked_list;

    if (user_blocked_list === null) {
      user_blocked_list = [];
      user_blocked_list.push(blocker_email);
    } else {
      user_blocked_list.push(blocker_email);
    }

    await user.update({
      blocked_list: user_blocked_list,
    });

    return res.json(user);
  }
}
export default new UserBlockController();
