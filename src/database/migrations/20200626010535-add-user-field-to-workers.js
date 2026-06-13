module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn('workers', 'user_id', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      allowNull: true,
    });
  },
  down: queryInterface => {
    return queryInterface.removeColumn('workers', 'user_id');
  },
};
