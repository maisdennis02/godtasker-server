module.exports = {
  up: async queryInterface => {
    const Sequelize = require('sequelize');
    // Device locale ("pt-BR", "en-US"), sent by the app with the push token so
    // notification copy can be localized for the recipient.
    await queryInterface.addColumn('users', 'locale', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
  },
  down: async queryInterface => {
    await queryInterface.removeColumn('users', 'locale');
  },
};
