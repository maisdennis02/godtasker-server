module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('services', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      creator_email: {
        type: Sequelize.STRING,
        references: { model: 'users', key: 'email' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING(2200),
        allowNull: true,
      },
      sub_task_list: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      task_attributes: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      points: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      price: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      confirm_photo_option: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      tenure: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      display_in_profile: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      canceled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  down: queryInterface => {
    return queryInterface.dropTable('services');
  },
};
