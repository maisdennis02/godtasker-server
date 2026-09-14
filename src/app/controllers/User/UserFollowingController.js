import { Op } from 'sequelize';
import firebaseAdmin from 'firebase-admin';

import User from '../../models/User';
import File from '../../models/File';
import logger from '../../../lib/logger';
import pushText from '../../../lib/pushText';
import { loadCurrentUser } from '../../utils/currentUser';

class UserFollowingController {
  // Follow another user. body: { target_email (whom I follow) }. The follower
  // is always the signed-in user; a `user_email` in the body is ignored.
  async store(req, res) {
    const { target_email } = req.body;

    const follower = await loadCurrentUser(req, res);
    if (!follower) return null;
    const target = await User.findOne({ where: { email: target_email } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (follower.id === target.id) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    await follower.addFollowing(target.id);

    // Firebase Notification ***************************************************
    const pushMessage = {
      notification: {
        title: `${follower.user_name}`,
        body: pushText(target, 'startedFollowing'),
      },
      data: {
        channelId: 'godtaskerChannel01', // (required)
        title: `${follower.user_name}`,
        message: pushText(target, 'startedFollowing'),
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
  // Unfollow. body: { target_email } — the signed-in user stops following them.
  async update(req, res) {
    const { target_email } = req.body;
    const follower = await loadCurrentUser(req, res);
    if (!follower) return null;
    const target = await User.findOne({ where: { email: target_email } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    await follower.removeFollowing(target.id);

    return res.json(follower);
  }
}

export default new UserFollowingController();
