import { Op } from 'sequelize';

import Message from '../../models/Message';
import ChatMessage from '../../models/ChatMessage';
import { io } from '../../../http';
import logger from '../../../lib/logger';

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

    return res.json(message);
  }
}

export default new ChatMessageController();
