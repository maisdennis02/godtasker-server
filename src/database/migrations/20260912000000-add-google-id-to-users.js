// Google Sign-In: the stable Google account id (`sub` claim of the ID token).
// Nullable — password accounts never set it; unique so one Google account can
// only ever map to one user row.
module.exports = {
  up: (queryInterface, Sequelize) =>
    queryInterface.addColumn('users', 'google_id', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    }),

  down: queryInterface => queryInterface.removeColumn('users', 'google_id'),
};
