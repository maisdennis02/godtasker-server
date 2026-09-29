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
        file_id: Sequelize.INTEGER,
        duration_ms: Sequelize.INTEGER,
      },
      {
        sequelize,
        tableName: 'chat_messages',
      }
    );
    return this;
  }

  static associate(models) {
    // Voice note (an uploaded File) — null for text messages.
    this.belongsTo(models.File, { foreignKey: 'file_id', as: 'audio' });
  }
}

export default ChatMessage;
