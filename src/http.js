import http from 'node:http';
import { Server } from 'socket.io';

import app from './app';

const serverHttp = http.createServer(app);
const io = new Server(serverHttp, {
  cors: { origin: '*' },
});

export { serverHttp, io };
