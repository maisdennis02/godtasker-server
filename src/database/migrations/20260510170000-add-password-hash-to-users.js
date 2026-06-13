module.exports = {
  up: (queryInterface, Sequelize) =>
    queryInterface.addColumn('users', 'password_hash', {
      type: Sequelize.STRING,
      allowNull: true,
    }),

  down: queryInterface => queryInterface.removeColumn('users', 'password_hash'),
};
