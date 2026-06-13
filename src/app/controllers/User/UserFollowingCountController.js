import User from '../../models/User';
// Count of users that `contactName` follows.
class UserFollowingCountController {
  async index(req, res) {
    const { contactName } = req.query;
    const user = await User.findOne({ where: { user_name: contactName } });
    if (!user) return res.json(0);

    const following = await user.getFollowing();
    return res.json(following.length);
  }
}

export default new UserFollowingCountController();
