import jwt from 'jsonwebtoken';
import * as Yup from 'yup';

import authConfig from '../../config/auth';
import User from '../models/User';
import File from '../models/File';

class SessionController {
  async store(req, res) {
    const schema = Yup.object().shape({
      email: Yup.string()
        .email()
        .required(),
      password: Yup.string()
        .min(8)
        .required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    const { email, password } = req.body;

    const user = await User.findOne({
      where: { email },
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['id', 'path', 'url'],
        },
      ],
    });

    if (!user || !user.password_hash) {
      // Don't leak whether the user exists.
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!(await user.checkPassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const {
      id,
      subscriber,
      first_name,
      last_name,
      user_name,
      birth_date,
      gender,
      avatar,
      instagram,
      linkedin,
      bio,
    } = user;

    return res.json({
      user: {
        id,
        subscriber,
        first_name,
        last_name,
        user_name,
        email,
        birth_date,
        gender,
        avatar,
        instagram,
        linkedin,
        bio,
      },
      token: jwt.sign({ id }, authConfig.secret, {
        expiresIn: authConfig.expiresIn,
        algorithm: authConfig.algorithm,
      }),
    });
  }
}

export default new SessionController();
