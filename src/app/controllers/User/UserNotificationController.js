import User from '../../models/User';
import logger from '../../../lib/logger';

class UserNotificationController {
  async update(req, res) {
    const { id } = req.params;
    const { notification_token } = req.body;

    try {
      const user = await User.findByPk(id);
      const updatedUser = user
        ? await user.update({ notification_token })
        : null;

      return res.json({ user: updatedUser });
    } catch (error) {
      logger.error({ err: error }, 'UserNotificationController.update');
      return res.status(500).json({ error: 'notification update failed' });
    }
  }
}

export default new UserNotificationController();
