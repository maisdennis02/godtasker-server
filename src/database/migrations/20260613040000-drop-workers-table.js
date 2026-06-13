// Final step of the Worker->User merge: remove the workers table.
// The messages.worker_id FK must go first; the column stays (now just a peer user ref).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('messages', 'messages_worker_id_fkey')
    await queryInterface.dropTable('workers')
  },

  down: async (queryInterface, Sequelize) => {
    // Recreate a minimal workers table so the FK can be restored (dev-only).
    await queryInterface.createTable('workers', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    })
    await queryInterface.addConstraint('messages', {
      fields: ['worker_id'],
      type: 'foreign key',
      name: 'messages_worker_id_fkey',
      references: { table: 'workers', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
  },
}
