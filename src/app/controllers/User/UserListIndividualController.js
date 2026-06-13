import User from '../../models/User';
import File from '../../models/File';
// -----------------------------------------------------------------------------
class UserListIndividualController {
  async index(req, res) {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['name', 'path', 'url'],
        },
      ],
    });

    return res.json(user);
  }
}

export default new UserListIndividualController();
