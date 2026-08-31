module.exports = {
  up: async queryInterface => {
    const Sequelize = require('sequelize');
    await queryInterface.addColumn('tasks', 'approval_required', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('tasks', 'approval_requested_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // Stamped once the 3-day overdue nag push has been sent, so it fires only once
    // per approval request (cleared on reopen).
    await queryInterface.addColumn('tasks', 'approval_overdue_notified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('tasks', 'reopened_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('tasks', 'reopen_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('tasks', 'reopen_feedback', {
      type: Sequelize.STRING(2200),
      allowNull: true,
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('tasks', 'approval_required');
    await queryInterface.removeColumn('tasks', 'approval_requested_at');
    await queryInterface.removeColumn('tasks', 'approval_overdue_notified_at');
    await queryInterface.removeColumn('tasks', 'reopened_at');
    await queryInterface.removeColumn('tasks', 'reopen_count');
    await queryInterface.removeColumn('tasks', 'reopen_feedback');
  },
};
