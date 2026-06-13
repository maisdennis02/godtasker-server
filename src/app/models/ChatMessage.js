import Sequelize, { Model } from 'sequelize';

class ChatMessage extends Model {
  static init(sequelize) {
    super.init(
      {
        chat_id: Sequelize.INTEGER,
        sender_email: Sequelize.STRING,
        recipient_email: Sequelize.STRING,
        body: Sequelize.TEXT,
        read_at: Sequelize.DATE,
      },
      {
        sequelize,
        tableName: 'chat_messages',
      }
    );
    return this;
  }
}

export default ChatMessage;
