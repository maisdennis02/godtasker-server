import 'dotenv/config';
import { serverHttp, io } from './http';
import logger from './lib/logger';

const PORT = Number(process.env.PORT) || 3333;

io.on('connection', socket => {
  logger.debug({ socketId: socket.id }, 'socket connected');

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
  logger.info(`GodTasker server listening on http://localhost:${PORT}`);
});
