import { Op } from 'sequelize';
import firebaseAdmin from 'firebase-admin';

import Message from '../../models/Message';
import ChatMessage from '../../models/ChatMessage';
import User from '../../models/User';
import { io } from '../../../http';
import logger from '../../../lib/logger';
import { isBlockedBetween } from '../../utils/blocks';

class ChatMessageController {
  // Resolve (or create) the conversation header for a user<->worker pair and
  // return its chat_id. Idempotent — safe to call every time a chat opens.
  // POST /messages/start  body: { user_email, worker_email }
  async start(req, res) {
    const { user_email, worker_email } = req.body;

    if (!user_email || !worker_email) {
      return res
        .status(400)
        .json({ error: 'user_email and worker_email are required' });
    }

    // Both parties must be real accounts — otherwise a typo'd email creates a
    // ghost conversation that clutters the list forever.
    const parties = await User.findAll({
      where: { email: [user_email, worker_email] },
      attributes: ['email', 'blocked_list'],
    });
    const found = new Set(parties.map(u => u.email));
    const missing = [user_email, worker_email].find(e => !found.has(e));
    if (missing) {
      return res.status(404).json({ error: `No user with email ${missing}` });
    }

    // Blocking must actually block: neither side can open a conversation.
    const byEmail = new Map(parties.map(u => [u.email, u]));
    if (isBlockedBetween(byEmail.get(user_email), byEmail.get(worker_email))) {
      return res
        .status(403)
        .json({ error: 'This conversation is unavailable' });
    }

    let header = await Message.findOne({
      where: {
        [Op.or]: [
          { user_email, worker_email },
          { user_email: worker_email, worker_email: user_email },
        ],
      },
    });

    if (!header) {
      // chat_id is a non-null part of the messages composite key; derive the
      // next free value rather than relying on the autoincrement id.
      const maxChatId = (await Message.max('chat_id')) || 0;
      header = await Message.create({
        chat_id: maxChatId + 1,
        user_email,
        worker_email,
        messaged_at: String(Date.now()),
      });
    }

    return res.json({ chat_id: header.chat_id, header });
  }

  // GET /messages/:chatId/thread -> ordered message list for a conversation.
  async index(req, res) {
    const { chatId } = req.params;

    const messages = await ChatMessage.findAll({
      where: { chat_id: chatId },
      order: [['created_at', 'ASC']],
    });

    return res.json(messages);
  }

  // POST /messages/:chatId/send  body: { sender_email, recipient_email, body }
  async store(req, res) {
    const { chatId } = req.params;
    const { sender_email, recipient_email, body } = req.body;

    if (!sender_email || !body) {
      return res
        .status(400)
        .json({ error: 'sender_email and body are required' });
    }

    // Load both parties up front: the block check must run BEFORE the message
    // is persisted, and the push section reuses these below.
    let recipient = null;
    let sender = null;
    if (recipient_email) {
      [recipient, sender] = await Promise.all([
        User.findOne({ where: { email: recipient_email } }),
        User.findOne({ where: { email: sender_email } }),
      ]);
      if (isBlockedBetween(sender, recipient)) {
        return res
          .status(403)
          .json({ error: 'This conversation is unavailable' });
      }
    }

    const message = await ChatMessage.create({
      chat_id: chatId,
      sender_email,
      recipient_email,
      body,
    });

    // Bump the conversation header so the list can sort by recency.
    const header = await Message.findOne({ where: { chat_id: chatId } });
    if (header) {
      await header.update({ messaged_at: String(Date.now()) });
    }

    // Real-time delivery to everyone in this conversation's room.
    io.to(`chat_${chatId}`).emit('chat:message', message);
    logger.debug({ chatId, sender_email }, 'chat message sent');

    if (recipient_email) {
      // Wake the recipient's conversation list even when they haven't joined
      // this room (same user-addressed pattern as `task_create_${email}`).
      io.emit(`chat:notify_${recipient_email}`, { chat_id: Number(chatId) });

      // Push notification for the new message (same shape as the task pushes).
      if (recipient && recipient.notification_token) {
        const title = (sender && sender.user_name) || sender_email;
        const pushMessage = {
          notification: { title, body },
          data: { channelId: 'godtaskerChannel01', title, message: body },
          android: { notification: { sound: 'default' } },
          apns: { payload: { aps: { sound: 'default' } } },
          token: recipient.notification_token,
        };
        firebaseAdmin
          .messaging()
          .send(pushMessage)
          .catch(error => logger.error({ err: error }, 'FCM send failed'));
      }
    }

    return res.json(message);
  }
}

export default new ChatMessageController();
