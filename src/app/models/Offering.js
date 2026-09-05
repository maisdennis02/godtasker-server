import Sequelize, { Model } from 'sequelize';

// A task template a user offers on their profile. Requesting one spawns a Task.
class Offering extends Model {
  static init(sequelize) {
    super.init(
      {
        name: Sequelize.STRING,
        description: Sequelize.STRING(2200),
        sub_task_list: Sequelize.JSON,
        task_attributes: Sequelize.JSON,
        price: Sequelize.FLOAT,
        confirm_photo_option: Sequelize.INTEGER,
        tenure: Sequelize.INTEGER,
        display_in_profile: Sequelize.BOOLEAN,
        // Schedule copied onto spawned tasks, unless the requester picks it.
        start_date: Sequelize.DATE,
        due_date: Sequelize.DATE,
        // When true the requester may set or change the dates (the creator's
        // dates, if any, are defaults).
        requester_sets_dates: Sequelize.BOOLEAN,
        // Fixed task length; when set, due = start + duration.
        duration_minutes: Sequelize.INTEGER,
        // Weekday/hour window the requester must start inside (see utils/availability).
        availability: Sequelize.JSON,
        // Seats for an event/class; null = unlimited.
        max_requests: Sequelize.INTEGER,
        canceled_at: Sequelize.DATE,
      },
      {
        sequelize,
      }
    );
    return this;
  }

  static associate(models) {
    this.belongsTo(models.User, { foreignKey: 'creator_id', as: 'creator' });
    this.hasMany(models.Task, { foreignKey: 'offering_id', as: 'tasks' });
  }
}

export default Offering;
