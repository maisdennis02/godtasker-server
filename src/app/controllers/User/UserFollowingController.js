import { Op } from 'sequelize';
import firebaseAdmin from 'firebase-admin';

import User from '../../models/User';
import File from '../../models/File';
import logger from '../../../lib/logger';

class UserFollowingController {
  // Follow another user. body: { user_email (me), target_email (whom I follow) }
  async store(req, res) {
    const { user_email, target_email } = req.body;

    const follower = await User.findOne({ where: { email: user_email } });
    const target = await User.findOne({ where: { email: target_email } });
    if (!follower || !target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (follower.id === target.id) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    await follower.addFollowing(target.id);

    // Firebase Notification ***************************************************
    const pushMessage = {
      notification: {
        title: `The Godtasker`,
        body: `${follower.user_name} started following you`,
      },
      data: {
        channelId: 'godtaskerChannel01', // (required)
        title: `The Godtasker`,
        message: `${follower.user_name} started following you`,
      },
      android: { notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
      token: target.notification_token,
    };

    if (target.notification_token) {
      firebaseAdmin
        .messaging()
        .send(pushMessage)
        .catch(error => logger.error({ err: error }, 'FCM send failed'));
    }

    return res.json(follower);
  }

  // ---------------------------------------------------------------------------
  // List the users that `contactName` follows, filtered by name.
  async index(req, res) {
    const { contactName, nameFilter } = req.query;
    const user = await User.findOne({ where: { user_name: contactName } });
    if (!user) return res.json([]);

    const following = await user.getFollowing({
      where: {
        user_name: { [Op.like]: `%${nameFilter}%` },
        canceled_at: null,
      },
      include: [
        { model: File, as: 'avatar', attributes: ['name', 'path', 'url'] },
      ],
    });

    return res.json(following);
  }

  // ---------------------------------------------------------------------------
  // Unfollow. body: { user_email (me), target_email }
  async update(req, res) {
    const { user_email, target_email } = req.body;
    const follower = await User.findOne({ where: { email: user_email } });
    const target = await User.findOne({ where: { email: target_email } });
    if (!follower || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    await follower.removeFollowing(target.id);

    return res.json(follower);
  }
}

export default new UserFollowingController();
