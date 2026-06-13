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

    let user_flagged_list = user.flagged_list;

    if (user_flagged_list === null) {
      user_flagged_list = [];
      user_flagged_list.push(flagger_email);
    } else {
      user_flagged_list.push(flagger_email);
    }

    const counter = user.flag_count + 1;

    await user.update({
      flag_count: counter,
      flagged_list: user_flagged_list,
    });

    return res.json(user);
  }
}
export default new UserFlagController();
