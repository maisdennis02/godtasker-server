import User from '../../models/User';
// -----------------------------------------------------------------------------
class UserUnblockController {
  async update(req, res) {
    const { email, unblocker_email } = req.body;

    const user = await User.findOne({
      where: { email },
    });

    const user_blocked_list = user.blocked_list;

    user_blocked_list.map(u => {
      if (u === unblocker_email) {
        const position = user_blocked_list.indexOf(u);
        user_blocked_list.splice(position, 1);
      }
      return user_blocked_list;
    });

    await user.update({
      blocked_list: user_blocked_list,
    });

    return res.json(user);
  }
}
export default new UserUnblockController();
