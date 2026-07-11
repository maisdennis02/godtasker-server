module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'password_reset_hash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'password_reset_expires', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'password_reset_attempts', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('users', 'password_reset_hash');
    await queryInterface.removeColumn('users', 'password_reset_expires');
    await queryInterface.removeColumn('users', 'password_reset_attempts');
  },
};
