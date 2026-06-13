module.exports = {
  up: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.addColumn('workers', 'flag_count', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: true,
      }),
      queryInterface.addColumn('workers', 'flagged_list', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        // defaultValue: [],
        allowNull: true,
      }),
      queryInterface.addColumn('workers', 'blocked_list', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        // defaultValue: [],
        allowNull: true,
      }),
      queryInterface.addColumn('users', 'flag_count', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: true,
      }),
      queryInterface.addColumn('users', 'flagged_list', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        // defaultValue: [],
        allowNull: true,
      }),
      queryInterface.addColumn('users', 'blocked_list', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        // defaultValue: [],
        allowNull: true,
      }),
    ]);
  },

  down: queryInterface => {
    return Promise.all([
      queryInterface.removeColumn('workers', 'flag_count'),
      queryInterface.removeColumn('workers', 'flagged_list'),
      queryInterface.removeColumn('workers', 'blocked_list'),
      queryInterface.removeColumn('users', 'flag_count'),
      queryInterface.removeColumn('users', 'flagged_list'),
      queryInterface.removeColumn('users', 'blocked_list'),
    ]);
  },
};
