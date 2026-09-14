import { Op } from 'sequelize';
import firebaseAdmin from 'firebase-admin';

import ChatMessage from '../../models/ChatMessage';
import File from '../../models/File';
import Message from '../../models/Message';
import User from '../../models/User';
import logger from '../../../lib/logger';
import pushText from '../../../lib/pushText';
import { isChatParty, otherParty } from '../../utils/chatAccess';
import { loadCurrentUser } from '../../utils/currentUser';

class MessageController {
  async store(req, res) {
    const {
      user_id,
      user_email,
      worker_id,
      worker_email,
      chat_id,
      messaged_at,
    } = req.body;

    // Nobody creates a conversation header they aren't part of.
    const me = await loadCurrentUser(req, res);
    if (!me) return null;
    if (!isChatParty({ user_email, worker_email }, me.email)) {
      return res
        .status(403)
        .json({ error: 'You can only open your own conversations' });
    }

    const message = await Message.create({
      user_id,
      user_email,
      worker_id,
      worker_email,
      chat_id,
      messaged_at,
    });

    return res.json(message);
  }

  // ---------------------------------------------------------------------------
  // The signed-in user's conversation list. A `user_email` query param is
  // still sent by the clients but ignored — it used to list anyone's chats.
  async index(req, res) {
    const user = await loadCurrentUser(req, res);
    if (!user) return null;
    const user_email = user.email;

    const { blocked_list } = user;
    let checked_blocked_list = [];

    if (blocked_list !== null) {
      checked_blocked_list = blocked_list;
    }

    const messages = await Message.findAll({
      order: [['updated_at', 'DESC']],
      where: {
        [Op.or]: [{ user_email }, { worker_email: user_email }],
        user_email: {
          [Op.notIn]: checked_blocked_list,
        },
        worker_email: {
          [Op.notIn]: checked_blocked_list,
        },
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'user_name', 'email'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['name', 'path', 'url'],
            },
          ],
        },
        {
          model: User,
          as: 'peer',
          attributes: ['id', 'user_name', 'email'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['name', 'path', 'url'],
            },
          ],
        },
      ],
    });

    return res.json(messages);
  }

  // ---------------------------------------------------------------------------
  // Legacy "bump + push" for chat id `id`. Only a party may call it, and the
  // push always goes to the other party (never a client-chosen receiver).
  async update(req, res) {
    const { id } = req.params;
    const { messaged_at } = req.body;
    const messageObject = req.body.messageObject ?? {};

    const me = await loadCurrentUser(req, res);
    if (!me) return null;

    let message = await Message.findOne({
      where: {
        chat_id: id,
      },
    });
    if (!message) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!isChatParty(message, me.email)) {
      return res
        .status(403)
        .json({ error: 'You are not part of this conversation' });
    }

    const user = await User.findOne({
      where: {
        email: otherParty(message, me.email),
      },
    });

    try {
      // New message push. Both fields are client-supplied and optional — fall
      // back so the notification never renders "undefined:". (No trailing
      // colon on the body; it's the message text itself.)
      if (user && user.notification_token) {
        const pushTitle = `${messageObject.sender_name ?? pushText(user, 'newMessage')}:`;
        const pushBody = messageObject.message ?? '';
        const pushMessage = {
          notification: {
            title: pushTitle,
            body: pushBody,
          },
          data: {
            title: pushTitle,
            message: pushBody,
          },
          android: {
            notification: {
              sound: 'default',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
          token: user.notification_token,
        };

        firebaseAdmin
          .messaging()
          .send(pushMessage)
          .catch(error => logger.error({ err: error }, 'FCM send failed'));
      }
    } catch (error) {
      logger.error({ err: error }, 'MessageController.update');
    }

    message = await message.update({
      messaged_at,
    });

    return res.json(message);
  }

  // ---------------------------------------------------------------------------
  async delete(req, res) {
    const { id } = req.params;

    const me = await loadCurrentUser(req, res);
    if (!me) return null;

    const message = await Message.findByPk(id);
    if (!message) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (!isChatParty(message, me.email)) {
      return res
        .status(403)
        .json({ error: 'You are not part of this conversation' });
    }

    // Drop the thread too. chat_id values get reused (start() derives the next
    // one from max(chat_id)), so orphaned messages would resurface inside a
    // future stranger's conversation.
    if (message.chat_id != null) {
      await ChatMessage.destroy({ where: { chat_id: message.chat_id } });
    }
    await message.destroy();

    return res.json(message);
  }
}
export default new MessageController();
