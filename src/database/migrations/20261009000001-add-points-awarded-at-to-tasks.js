// When a finished task's points were credited to the assignee. Stamped once,
// so reopening and finishing again never pays twice.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tasks', 'points_awarded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('tasks', 'points_awarded_at');
  },
};
