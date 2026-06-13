import * as Yup from 'yup';
// -----------------------------------------------------------------------------
import User from '../../models/User';
import File from '../../models/File';
// -----------------------------------------------------------------------------
class UserUpdateNoPhotoController {
  async update(req, res) {
    const schema = Yup.object().shape({
      first_name: Yup.string(),
      last_name: Yup.string(),
      email: Yup.string(),
      instagram: Yup.string(),
      linkedin: Yup.string(),
      bio: Yup.string(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Yup error.' });
    }

    const { email } = req.body;

    let user = await User.findOne({
      where: {
        email,
      },
    });

    // console.log(user);
    // if (oldPassword && !(await user.checkPassword(oldPassword))) {
    //   return res
    //     .status(401)
    //     .json({ error: 'Erro: A senha atual não confere.' });
    // }

    await user.update(req.body);

    user = await User.findOne({
      where: {
        email,
      },
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['id', 'path', 'url'],
        },
      ],
    });

    return res.json(user);
  }
}
export default new UserUpdateNoPhotoController();
