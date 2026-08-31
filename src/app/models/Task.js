import Sequelize, { Model } from 'sequelize';

class Task extends Model {
  static init(sequelize) {
    super.init(
      {
        name: Sequelize.STRING,
        description: Sequelize.STRING(2200),
        sub_task_list: Sequelize.JSON,
        task_attributes: Sequelize.JSON,
        messages: Sequelize.JSON,
        status: Sequelize.JSON,
        status_bar: Sequelize.FLOAT,
        points: Sequelize.INTEGER,
        score: Sequelize.INTEGER,
        price: Sequelize.FLOAT,
        confirm_photo: Sequelize.BOOLEAN,
        approval_required: Sequelize.BOOLEAN,
        approval_requested_at: Sequelize.DATE,
        approval_overdue_notified_at: Sequelize.DATE,
        reopened_at: Sequelize.DATE,
        reopen_count: Sequelize.INTEGER,
        reopen_feedback: Sequelize.STRING(2200),
        unread_user: Sequelize.INTEGER,
        unread_worker: Sequelize.INTEGER,
        start_date: Sequelize.DATE,
        initiated_at: Sequelize.DATE,
        due_date: Sequelize.DATE,
        end_date: Sequelize.DATE,
        messaged_at: Sequelize.DATE,
        canceled_at: Sequelize.DATE,
        requester_email: Sequelize.STRING,
        assignee_email: Sequelize.STRING,
      },
      {
        sequelize,
      }
    );
    return this;
  }

  static associate(models) {
    // Both sides are users now: requester (sender) and assignee (doer).
    this.belongsTo(models.User, { foreignKey: 'requester_id', as: 'requester' });
    this.belongsTo(models.User, { foreignKey: 'assignee_id', as: 'assignee' });
    this.belongsTo(models.Signature, {
      foreignKey: 'signature_id',
      as: 'signature',
    });
  }
}
export default Task;
