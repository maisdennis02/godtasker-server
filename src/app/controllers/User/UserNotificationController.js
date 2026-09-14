import User from '../../models/User';
import logger from '../../../lib/logger';

class UserNotificationController {
  async update(req, res) {
    const { id } = req.params;
    const { notification_token, locale } = req.body;

    // The push token is a delivery address: letting one account set another's
    // would redirect (or silence) that person's notifications. The client
    // always sends its own id here.
    if (Number(id) !== req.userId) {
      return res
        .status(403)
        .json({ error: 'You can only update your own notification settings' });
    }

    try {
      const user = await User.findByPk(id);
      const updatedUser = user
        ? await user.update({
            notification_token,
            // Only overwrite the locale when the client sent one (logout clears
            // the token alone).
            ...(typeof locale === 'string' ? { locale: locale.slice(0, 16) } : {}),
          })
        : null;

      return res.json({ user: updatedUser });
    } catch (error) {
      logger.error({ err: error }, 'UserNotificationController.update');
      return res.status(500).json({ error: 'notification update failed' });
    }
  }
}

export default new UserNotificationController();
