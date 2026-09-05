module.exports = {
  up: async queryInterface => {
    const Sequelize = require('sequelize');

    // Creator-defined schedule, copied onto every task spawned from the offering.
    await queryInterface.addColumn('offerings', 'start_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('offerings', 'due_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // When true the requester picks start/due at request time instead.
    await queryInterface.addColumn('offerings', 'requester_sets_dates', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    // Seats for an event/class. NULL = unlimited.
    await queryInterface.addColumn('offerings', 'max_requests', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Link spawned tasks back to their offering so seats can be counted.
    await queryInterface.addColumn('tasks', 'offering_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'offerings', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('tasks', ['offering_id'], {
      name: 'tasks_offering_id_idx',
    });
  },

  down: async queryInterface => {
    await queryInterface.removeIndex('tasks', 'tasks_offering_id_idx');
    await queryInterface.removeColumn('tasks', 'offering_id');
    await queryInterface.removeColumn('offerings', 'max_requests');
    await queryInterface.removeColumn('offerings', 'requester_sets_dates');
    await queryInterface.removeColumn('offerings', 'due_date');
    await queryInterface.removeColumn('offerings', 'start_date');
  },
};
