module.exports = {
  up: async queryInterface => {
    const Sequelize = require('sequelize');
    // Fixed length of the task; when set, due = start + duration.
    await queryInterface.addColumn('offerings', 'duration_minutes', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    // Window the requester must pick a start inside:
    // { days: [1,2,3,4,5], from: "08:00", to: "17:00", tz: "America/Sao_Paulo" }
    await queryInterface.addColumn('offerings', 'availability', {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('offerings', 'availability');
    await queryInterface.removeColumn('offerings', 'duration_minutes');
  },
};
