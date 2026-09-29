import { Op } from 'sequelize';
import firebaseAdmin from 'firebase-admin';

import Message from '../../models/Message';
import ChatMessage from '../../models/ChatMessage';
import File from '../../models/File';
import User from '../../models/User';
import { io } from '../../../http';
import logger from '../../../lib/logger';
import pushText from '../../../lib/pushText';
import { isBlockedBetween } from '../../utils/blocks';
import { isChatParty, otherParty } from '../../utils/chatAccess';
import { loadCurrentUser } from '../../utils/currentUser';

// Voice-note attachment returned with every message (null for text).
const withAudio = {
  include: [{ model: File, as: 'audio', attributes: ['id', 'name', 'path', 'url'] }],
};

// Longest voice note the clients record; anything longer is a bad client.
const MAX_VOICE_MS = 5 * 60 * 1000;

// Loads the conversation header for `chatId` and the signed-in user, and
// rejects anyone who isn't one of its two parties. Sends the response and
// returns null when the caller may not touch it.
async function loadChatFor(chatId, req, res) {
  const me = await loadCurrentUser(req, res);
  if (!me) return null;
  const header = await Message.findOne({ where: { chat_id: chatId } });
  if (!header) {
    res.status(404).json({ error: 'Conversation not found' });
    return null;
  }
  if (!isChatParty(header, me.email)) {
    res.status(403).json({ error: 'You are not part of this conversation' });
    return null;
  }
  return { me, header };
}

class ChatMessageController {
  // Resolve (or create) the conversation header for a user<->worker pair and
  // return its chat_id. Idempotent — safe to call every time a chat opens.
  // POST /messages/start  body: { user_email, worker_email } — one of them
  // must be the signed-in user.
  async start(req, res) {
    const { user_email, worker_email } = req.body;

    if (!user_email || !worker_email) {
      return res
        .status(400)
        .json({ error: 'user_email and worker_email are required' });
    }
    if (user_email === worker_email) {
      return res
        .status(400)
        .json({ error: 'You cannot start a conversation with yourself' });
    }

    const me = await loadCurrentUser(req, res);
    if (!me) return null;
    if (me.email !== user_email && me.email !== worker_email) {
      return res
        .status(403)
        .json({ error: 'You can only open your own conversations' });
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

    const chat = await loadChatFor(chatId, req, res);
    if (!chat) return null;

    const messages = await ChatMessage.findAll({
      where: { chat_id: chatId },
      order: [['created_at', 'ASC']],
      ...withAudio,
    });

    return res.json(messages);
  }

  // POST /messages/:chatId/send  body: { body } for text, or
  // { file_id, duration_ms } for a voice note uploaded via POST /files/audio.
  // The sender is the signed-in
  // user and the recipient is the other party on the header; client-supplied
  // `sender_email` / `recipient_email` can't redirect either.
  async store(req, res) {
    const { chatId } = req.params;
    const { sender_email, body, file_id, duration_ms } = req.body;

    if (!body && !file_id) {
      return res.status(400).json({ error: 'body or file_id is required' });
    }
    let audio = null;
    if (file_id) {
      audio = await File.findByPk(file_id);
      if (!audio) {
        return res.status(400).json({ error: 'Audio file not found' });
      }
    }
    const duration =
      duration_ms === undefined || duration_ms === null
        ? null
        : Number(duration_ms);
    if (
      duration !== null &&
      !(Number.isInteger(duration) && duration >= 0 && duration <= MAX_VOICE_MS)
    ) {
      return res.status(400).json({ error: 'Invalid duration_ms' });
    }

    const chat = await loadChatFor(chatId, req, res);
    if (!chat) return null;
    const { me: sender, header } = chat;

    if (sender_email && sender_email !== sender.email) {
      return res
        .status(403)
        .json({ error: 'You can only send messages as yourself' });
    }

    // The block check must run BEFORE the message is persisted; the push
    // section reuses the recipient below.
    const recipient_email = otherParty(header, sender.email);
    const recipient = await User.findOne({ where: { email: recipient_email } });
    if (isBlockedBetween(sender, recipient)) {
      return res.status(403).json({ error: 'This conversation is unavailable' });
    }

    const created = await ChatMessage.create({
      chat_id: chatId,
      sender_email: sender.email,
      recipient_email,
      body: body || null,
      file_id: audio ? audio.id : null,
      duration_ms: audio ? duration : null,
    });
    const message = await ChatMessage.findByPk(created.id, withAudio);

    // Bump the conversation header so the list can sort by recency.
    await header.update({ messaged_at: String(Date.now()) });

    // Real-time delivery to everyone in this conversation's room.
    io.to(`chat_${chatId}`).emit('chat:message', message);
    logger.debug({ chatId, sender_id: sender.id }, 'chat message sent');

    if (recipient) {
      // Wake the recipient's conversation list even when they haven't joined
      // this room. Only their own sockets (the per-user room joined with a
      // valid token in server.js) hear it — a broadcast would tell every
      // connected client who is being messaged.
      io.to(`user_${recipient.id}`).emit(`chat:notify_${recipient_email}`, {
        chat_id: Number(chatId),
      });

      // Push notification for the new message (same shape as the task pushes).
      if (recipient.notification_token) {
        const title = sender.user_name || sender.email;
        const text = body || pushText(recipient, 'voiceMessage');
        const pushMessage = {
          notification: { title, body: text },
          data: { channelId: 'godtaskerChannel01', title, message: text },
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
