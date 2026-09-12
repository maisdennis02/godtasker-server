import * as Yup from 'yup';

import User from '../models/User';
import File from '../models/File';
import { buildSession } from '../utils/session';

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

    return res.json(buildSession(user));
  }
}

export default new SessionController();
