import * as Yup from 'yup';

import appleConfig from '../../config/apple';
import User from '../models/User';
import File from '../models/File';
import logger from '../../lib/logger';
import { buildSession } from '../utils/session';
import { uniqueUserName } from '../utils/userName';
import { verifyAppleIdentityToken, AppleKeysUnavailableError } from '../../lib/appleIdentity';
import { sendWelcomeTask } from '../../lib/onboarding';
import { touchClient } from '../../lib/clientPlatform';

// Apple only hands the person's name to the app (never puts it in the token),
// and only on the very first authorization. It is display data, not identity,
// so taking it from the request body is fine — but keep it short and stringy.
function cleanName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 80);
  return trimmed || null;
}

class AppleSessionController {
  // POST /sessions/apple  { identityToken, fullName?: { givenName, familyName }, locale? }
  // The iOS app obtains an identity token from "Sign in with Apple" and we
  // verify it here — never trust the email/sub from the client.
  async store(req, res) {
    const schema = Yup.object().shape({
      identityToken: Yup.string().required(),
    });
    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    if (appleConfig.clientIds.length === 0) {
      logger.warn('[apple-signin] APPLE_CLIENT_IDS not set — refusing');
      return res.status(503).json({ error: 'Apple sign-in is not configured' });
    }

    let claims;
    try {
      claims = await verifyAppleIdentityToken(req.body.identityToken, appleConfig.clientIds);
    } catch (err) {
      if (err instanceof AppleKeysUnavailableError) {
        logger.error({ err: err.message }, '[apple-signin] cannot verify right now');
        return res.status(503).json({ error: 'Apple sign-in is temporarily unavailable' });
      }
      logger.warn({ err: err.message }, '[apple-signin] token rejected');
      return res.status(401).json({ error: 'Invalid Apple token' });
    }

    const { sub: appleId, email } = claims || {};
    // Apple sends email_verified as the string "true" in some tokens.
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    const isPrivateEmail = claims.is_private_email === true || claims.is_private_email === 'true';

    if (!appleId) {
      return res.status(401).json({ error: 'Invalid Apple token' });
    }

    const include = [{ model: File, as: 'avatar', attributes: ['id', 'path', 'url'] }];

    // 1) Returning Apple user. Matched by `sub` alone: later tokens may carry a
    //    different email, or none.
    let user = await User.findOne({ where: { apple_id: appleId }, include });

    if (!user) {
      if (!email || !emailVerified) {
        // Without a verified email there is nothing safe to link or create.
        return res.status(401).json({ error: 'Apple account email is not verified' });
      }

      // 2) Existing account with the same (verified) email → link it. People
      //    who chose "Hide My Email" get a relay address that matches nothing,
      //    so they fall through to a new account.
      user = await User.findOne({ where: { email }, include });
      if (user) {
        await user.update({ apple_id: appleId });
      }
    }

    // 3) Brand-new account. No password: password_hash stays null and the
    //    email/password login rejects it until the user sets one in-app.
    if (!user) {
      const { locale, fullName } = req.body;
      const firstName = cleanName(fullName && fullName.givenName);
      const lastName = cleanName(fullName && fullName.familyName);
      // A relay address's local part is random characters — a poor username.
      const seed =
        [firstName, lastName].filter(Boolean).join('') ||
        (isPrivateEmail ? 'user' : email.split('@')[0]);
      const created = await User.create({
        apple_id: appleId,
        email,
        user_name: await uniqueUserName(seed),
        first_name: firstName,
        last_name: lastName,
        points: 0,
        locale: typeof locale === 'string' ? locale.slice(0, 16) : null,
      });
      logger.info({ userId: created.id, relay: isPrivateEmail }, '[apple-signin] new user');
      await sendWelcomeTask(created, created.locale);
      user = await User.findByPk(created.id, { include });
    }

    if (user.canceled_at) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await touchClient(user, req);
    return res.json(buildSession(user));
  }
}

export default new AppleSessionController();
