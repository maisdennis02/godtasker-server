// Which client a person last used (android / ios / web / unknown, derived from
// the User-Agent) and when. Stamped on every login and on the app's launch-time
// notification update, so the tester report can tell Play testers from website
// visitors.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'last_client', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'last_seen_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('users', 'last_seen_at');
    await queryInterface.removeColumn('users', 'last_client');
  },
};
