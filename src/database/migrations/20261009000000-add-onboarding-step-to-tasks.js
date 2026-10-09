// Welcome tasks come in a sequence of three; the step number marks a task as
// one of them (null for every other task) and drives sending the next one.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tasks', 'onboarding_step', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('tasks', 'onboarding_step');
  },
};
