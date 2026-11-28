// Sign in with Apple: the stable Apple account id (`sub` claim of the identity
// token; the same for every app of one developer team). Nullable — other
// accounts never set it; unique so one Apple account maps to one user row.
module.exports = {
  up: (queryInterface, Sequelize) =>
    queryInterface.addColumn('users', 'apple_id', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    }),

  down: queryInterface => queryInterface.removeColumn('users', 'apple_id'),
};
