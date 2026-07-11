import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as Yup from 'yup';

import User from '../models/User';
import sendMail from '../../lib/mail';
import logger from '../../lib/logger';

const CODE_TTL_MS = 15 * 60 * 1000;
// A 6-digit code has low entropy, so cap guesses per issued code (on top of
// the per-IP authLimiter).
const MAX_ATTEMPTS = 5;

class PasswordResetController {
  // POST /password/forgot — email a one-time reset code.
  async store(req, res) {
    const schema = Yup.object().shape({
      email: Yup.string()
        .email()
        .required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    const { email } = req.body;

    // Same response whether or not the account exists — don't leak
    // which emails are registered.
    const reply = () =>
      res.json({
        message: 'If that email is registered, a reset code has been sent.',
      });

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return reply();
    }

    const code = crypto
      .randomInt(0, 1000000)
      .toString()
      .padStart(6, '0');

    await user.update({
      password_reset_hash: await bcrypt.hash(code, 12),
      password_reset_expires: new Date(Date.now() + CODE_TTL_MS),
      password_reset_attempts: 0,
    });

    try {
      await sendMail({
        to: email,
        subject: 'GodTasker password reset code',
        text:
          `Your GodTasker password reset code is: ${code}\n\n` +
          `It expires in 15 minutes.\n\n` +
          `If you didn't request this, you can safely ignore this email.`,
      });
    } catch (err) {
      logger.error({ err, email }, 'Failed to send password reset email');
    }

    return reply();
  }

  // POST /password/reset — verify the code and set the new password.
  async update(req, res) {
    const schema = Yup.object().shape({
      email: Yup.string()
        .email()
        .required(),
      code: Yup.string()
        .matches(/^\d{6}$/)
        .required(),
      password: Yup.string()
        .min(8)
        .required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    const { email, code, password } = req.body;

    const user = await User.findOne({ where: { email } });

    // One generic error for every failure mode — reveals nothing about
    // whether the email, code, or expiry was the problem.
    const invalid = () =>
      res.status(401).json({ error: 'Invalid or expired code' });

    if (
      !user ||
      !user.password_reset_hash ||
      !user.password_reset_expires ||
      user.password_reset_expires < new Date() ||
      user.password_reset_attempts >= MAX_ATTEMPTS
    ) {
      return invalid();
    }

    if (!(await bcrypt.compare(code, user.password_reset_hash))) {
      await user.update({
        password_reset_attempts: user.password_reset_attempts + 1,
      });
      return invalid();
    }

    // Code checks out: set the new password (hashed by the beforeSave hook)
    // and burn the code.
    await user.update({
      password,
      password_reset_hash: null,
      password_reset_expires: null,
      password_reset_attempts: null,
    });

    return res.json({ message: 'Password updated. You can now sign in.' });
  }
}

export default new PasswordResetController();
