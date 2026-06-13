// Services become "offerings" owned by a user (creator_id) instead of creator_email.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint(
      'services',
      'services_creator_email_fkey'
    )
    await queryInterface.renameTable('services', 'offerings')
    await queryInterface.removeColumn('offerings', 'creator_email')
    await queryInterface.addColumn('offerings', 'creator_id', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      allowNull: true,
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('offerings', 'creator_id')
    await queryInterface.addColumn('offerings', 'creator_email', {
      type: Sequelize.STRING,
      allowNull: true,
    })
    await queryInterface.renameTable('offerings', 'services')
    await queryInterface.addConstraint('services', {
      fields: ['creator_email'],
      type: 'foreign key',
      name: 'services_creator_email_fkey',
      references: { table: 'users', field: 'email' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
  },
}
