module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('tasks', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        allowNull: false,
      },
      useremail: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      worker_id: {
        type: Sequelize.INTEGER,
        references: { model: 'workers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        allowNull: false,
      },
      workeremail: {
        type: Sequelize.STRING,
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
      messages: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      status: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      status_bar: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      points: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      score: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      price: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      confirm_photo: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      unread_user: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      unread_worker: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      initiated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      messaged_at: {
        type: Sequelize.DATE,
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
    return queryInterface.dropTable('tasks');
  },
};
