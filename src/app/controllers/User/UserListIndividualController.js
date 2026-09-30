import User from '../../models/User';
import File from '../../models/File';
import { loadCurrentUser } from '../../utils/currentUser';
import { publicUser } from '../../utils/publicUser';
// -----------------------------------------------------------------------------
class UserListIndividualController {
  async index(req, res) {
    const { id } = req.params;
    const me = await loadCurrentUser(req, res);
    if (!me) return null;

    const user = await User.findByPk(id, {
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['name', 'path', 'url'],
        },
      ],
    });

    return res.json(publicUser(user, me));
  }
}

export default new UserListIndividualController();
