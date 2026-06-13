import 'dotenv/config';
import Sequelize from 'sequelize';
import firebaseAdmin from 'firebase-admin';

import User from '../app/models/User';
import File from '../app/models/File';
import Task from '../app/models/Task';
import Message from '../app/models/Message';
import ChatMessage from '../app/models/ChatMessage';
import Offering from '../app/models/Offering';
import Signature from '../app/models/Signature';

import databaseConfig from '../config/database';
import logger from '../lib/logger';

const models = [User, File, Task, Message, ChatMessage, Offering, Signature];

const {
  FCM_PROJECT_ID,
  FCM_PRIVATE_KEY_ID,
  FCM_PRIVATE_KEY,
  FCM_CLIENT_EMAIL,
  FCM_CLIENT_ID,
  FCM_DATABASE_URL,
} = process.env;

if (FCM_PROJECT_ID && FCM_PRIVATE_KEY && FCM_CLIENT_EMAIL) {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert({
      type: 'service_account',
      project_id: FCM_PROJECT_ID,
      private_key_id: FCM_PRIVATE_KEY_ID,
      // .env stores the key with literal "\n" — convert back to real newlines.
      private_key: FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: FCM_CLIENT_EMAIL,
      client_id: FCM_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url:
        'https://www.googleapis.com/oauth2/v1/certs',
    }),
    databaseURL: FCM_DATABASE_URL,
  });
} else {
  logger.warn(
    '[firebase-admin] FCM_* env vars not set — push notifications disabled.'
  );
}

class Database {
  constructor() {
    this.init();
  }

  init() {
    this.connection = new Sequelize(databaseConfig);

    models
      .map(model => model.init(this.connection))
      .map(model => model.associate && model.associate(this.connection.models));
  }
}

export default new Database();
