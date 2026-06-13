// Following becomes user->user: user_workers(user_id,worker_id) -> user_followers(follower_id,following_id).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint(
      'user_workers',
      'user_workers_worker_id_fkey'
    )
    await queryInterface.renameTable('user_workers', 'user_followers')
    await queryInterface.renameColumn('user_followers', 'user_id', 'follower_id')
    await queryInterface.renameColumn(
      'user_followers',
      'worker_id',
      'following_id'
    )
    await queryInterface.addConstraint('user_followers', {
      fields: ['following_id'],
      type: 'foreign key',
      name: 'user_followers_following_id_fkey',
      references: { table: 'users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint(
      'user_followers',
      'user_followers_following_id_fkey'
    )
    await queryInterface.renameColumn(
      'user_followers',
      'following_id',
      'worker_id'
    )
    await queryInterface.renameColumn('user_followers', 'follower_id', 'user_id')
    await queryInterface.renameTable('user_followers', 'user_workers')
    await queryInterface.addConstraint('user_workers', {
      fields: ['worker_id'],
      type: 'foreign key',
      name: 'user_workers_worker_id_fkey',
      references: { table: 'workers', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    })
  },
}
