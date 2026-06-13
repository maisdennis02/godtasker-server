import Sequelize, { Model } from 'sequelize';

class Message extends Model {
  static init(sequelize) {
    super.init(
      {
        user_email: Sequelize.STRING,
        worker_email: Sequelize.STRING,
        messaged_at: Sequelize.STRING,
        chat_id: Sequelize.INTEGER,
        canceled_at: Sequelize.DATE,
      },
      {
        sequelize,
      }
    );
    return this;
  }

  static associate(models) {
    // Conversation header is now user<->user; `worker_id`/`worker_email` columns
    // are kept but reference the peer user.
    this.belongsTo(models.User, { foreignKey: 'worker_id', as: 'peer' });
    this.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  }
}
export default Message;
