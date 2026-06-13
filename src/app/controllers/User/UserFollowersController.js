import { Op } from 'sequelize';
import User from '../../models/User';
import File from '../../models/File';

// Followers of a user (replaces the old Worker "followed" endpoints).
class UserFollowersController {
  // List followers of `userName`, filtered by name.
  async index(req, res) {
    const { userName, nameFilter } = req.query;
    const user = await User.findOne({ where: { user_name: userName } });
    if (!user) return res.json([]);

    const followers = await user.getFollowers({
      where: {
        user_name: { [Op.like]: `%${nameFilter}%` },
        canceled_at: null,
      },
      include: [
        { model: File, as: 'avatar', attributes: ['name', 'path', 'url'] },
      ],
    });

    return res.json(followers);
  }

  // Count of followers of `userName`.
  async count(req, res) {
    const { userName } = req.query;
    const user = await User.findOne({ where: { user_name: userName } });
    if (!user) return res.json(0);

    const followers = await user.getFollowers();
    return res.json(followers.length);
  }
}

export default new UserFollowersController();
