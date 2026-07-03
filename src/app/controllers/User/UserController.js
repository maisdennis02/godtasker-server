import * as Yup from 'yup';

import User from '../../models/User';
import File from '../../models/File';

class UserController {
  async store(req, res) {
    const schema = Yup.object().shape({
      user_name: Yup.string().required(),
      email: Yup.string()
        .email()
        .required(),
      password: Yup.string()
        .min(8)
        .required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Create User fail: Schema error' });
    }

    const { subscriber, user_name, hint, email, password, points, bio } =
      req.body;

    const userExists = await User.findOne({ where: { email } });
    if (userExists) {
      return res
        .status(400)
        .json({ error: 'Create User fail: Email already exists.' });
    }

    // password (VIRTUAL) triggers the beforeSave hook -> password_hash.
    const user = await User.create({
      subscriber,
      user_name,
      hint,
      email,
      password,
      points,
      bio,
    });

    return res.json({ user });
  }

  async update(req, res) {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Never allow the hash to be set directly — password (VIRTUAL) is the only way in.
    const { password, oldPassword, password_hash, ...rest } = req.body;

    // Changing the password requires proving knowledge of the current one.
    if (password) {
      if (!oldPassword || !(await user.checkPassword(oldPassword))) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      if (String(password).length < 8) {
        return res
          .status(400)
          .json({ error: 'New password must be at least 8 characters' });
      }
    }

    await user.update(password ? { ...rest, password } : rest);

    const refreshed = await User.findByPk(req.userId, {
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['id', 'path', 'url'],
        },
      ],
    });

    const { id, first_name, last_name, user_name, email, avatar } = refreshed;
    return res.json({ id, first_name, last_name, user_name, email, avatar });
  }

  async index(req, res) {
    const users = await User.findAll({ where: { canceled_at: null } });
    return res.json(users);
  }

  async delete(req, res) {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await user.destroy();
    return res.json({ deleted: true, id });
  }
}

export default new UserController();
