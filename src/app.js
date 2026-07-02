import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import routes from './routes';
import { apiLimiter } from './app/middlewares/rateLimit';
import './database';

class App {
  constructor() {
    this.server = express();
    // Running behind the host's proxy (Render/etc.) — trust the first hop so
    // req.ip is the real client IP (rate limiting + logs key on it correctly).
    this.server.set('trust proxy', 1);
    this.middlewares();
    this.routes();
  }

  middlewares() {
    this.server.use(helmet());
    this.server.use(cors());
    this.server.use(apiLimiter);
    this.server.use(express.json({ limit: '10mb' }));
  }

  routes() {
    this.server.use(routes);
  }
}

export default new App().server;
