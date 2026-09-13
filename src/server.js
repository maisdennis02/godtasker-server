import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { serverHttp, io } from './http';
import logger from './lib/logger';
import authConfig from './config/auth';
import { startApprovalOverdueNotifier } from './lib/approvalOverdueNotifier';

const PORT = Number(process.env.PORT) || 3333;

io.on('connection', socket => {
  logger.debug({ socketId: socket.id }, 'socket connected');

  // Per-user room for real-time task sync (lib/taskEvents.js). Only a valid
  // JWT earns a room; a socket without one still works for chat, as before.
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const { id } = jwt.verify(token, authConfig.secret, {
        algorithms: [authConfig.algorithm],
      });
      socket.join(`user_${id}`);
    } catch {
      logger.debug({ socketId: socket.id }, 'socket token rejected: no user room');
    }
  }

  // Join/leave a conversation room so chat:message events reach both parties.
  socket.on('chat:join', chatId => {
    socket.join(`chat_${chatId}`);
    logger.debug({ socketId: socket.id, chatId }, 'socket joined chat');
  });

  socket.on('chat:leave', chatId => {
    socket.leave(`chat_${chatId}`);
  });

  socket.on('disconnect', () => {
    logger.debug({ socketId: socket.id }, 'socket disconnected');
  });
});

serverHttp.listen(PORT, () => {
  logger.info(`LalaTask server listening on http://localhost:${PORT}`);
  startApprovalOverdueNotifier();
});
