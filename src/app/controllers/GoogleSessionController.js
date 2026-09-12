import { OAuth2Client } from 'google-auth-library';
import * as Yup from 'yup';

import googleConfig from '../../config/google';
import User from '../models/User';
import File from '../models/File';
import logger from '../../lib/logger';
import { buildSession } from '../utils/session';

const oauthClient = new OAuth2Client();

// user_name is what other people see; derive a sane default from the Google
// profile and make it unique with a numeric suffix if it's taken.
async function uniqueUserName(seed) {
  const base =
    String(seed || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'user';
  let candidate = base;
  for (let i = 0; await User.findOne({ where: { user_name: candidate } }); i += 1) {
    candidate = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    if (i > 20) break; // practically unreachable; keep a hard stop anyway
  }
  return candidate;
}

class GoogleSessionController {
  // POST /sessions/google  { idToken }
  // The client obtains a Google ID token (GIS on the web, the native SDK on
  // mobile) and we verify it here — never trust the email/sub from the client.
  async store(req, res) {
    const schema = Yup.object().shape({
      idToken: Yup.string().required(),
    });
    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    if (googleConfig.clientIds.length === 0) {
      logger.warn('[google-signin] GOOGLE_CLIENT_IDS not set — refusing');
      return res.status(503).json({ error: 'Google sign-in is not configured' });
    }

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: req.body.idToken,
        audience: googleConfig.clientIds,
      });
      payload = ticket.getPayload();
    } catch (err) {
      logger.warn({ err: err.message }, '[google-signin] token rejected');
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const { sub: googleId, email, email_verified: emailVerified, name, picture } =
      payload || {};

    if (!googleId || !email || !emailVerified) {
      // An unverified Google email must not be allowed to claim an existing
      // password account with that address.
      return res.status(401).json({ error: 'Google account email is not verified' });
    }

    const include = [{ model: File, as: 'avatar', attributes: ['id', 'path', 'url'] }];

    // 1) Returning Google user.
    let user = await User.findOne({ where: { google_id: googleId }, include });

    // 2) Existing password account with the same (verified) email → link it.
    if (!user) {
      user = await User.findOne({ where: { email }, include });
      if (user) {
        await user.update({ google_id: googleId });
      }
    }

    // 3) Brand-new account. No password: password_hash stays null and the
    //    email/password login rejects it until the user sets one in-app.
    if (!user) {
      const created = await User.create({
        google_id: googleId,
        email,
        user_name: await uniqueUserName(name || email.split('@')[0]),
        first_name: payload.given_name || null,
        last_name: payload.family_name || null,
        points: 0,
      });
      logger.info({ userId: created.id, picture: !!picture }, '[google-signin] new user');
      user = await User.findByPk(created.id, { include });
    }

    if (user.canceled_at) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    return res.json(buildSession(user));
  }
}

export default new GoogleSessionController();
