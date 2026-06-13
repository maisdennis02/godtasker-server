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
  }
}

export default Offering;
