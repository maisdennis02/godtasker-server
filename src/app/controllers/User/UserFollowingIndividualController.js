import User from '../../models/User';
// Whether user_id follows target_id (returns the followed user if so).
class UserFollowingIndividualController {
  async index(req, res) {
    const { user_id, target_id } = req.query;
    const user = await User.findByPk(user_id);
    if (!user) return res.json([]);

    const target = await user.getFollowing({ where: { id: target_id } });
    return res.json(target);
  }
}

export default new UserFollowingIndividualController();
