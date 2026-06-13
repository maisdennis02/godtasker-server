// Tasks become user->user: user_id/worker_id -> requester_id/assignee_id, both FK users.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // worker_id pointed at the (soon-removed) workers table.
    await queryInterface.removeConstraint('tasks', 'tasks_worker_id_fkey')

    await queryInterface.renameColumn('tasks', 'user_id', 'requester_id')
    await queryInterface.renameColumn('tasks', 'useremail', 'requester_email')
    await queryInterface.renameColumn('tasks', 'worker_id', 'assignee_id')
    await queryInterface.renameColumn('tasks', 'workeremail', 'assignee_email')

    await queryInterface.addConstraint('tasks', {
      fields: ['assignee_id'],
      type: 'foreign key',
      name: 'tasks_assignee_id_fkey',
      references: { table: 'users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('tasks', 'tasks_assignee_id_fkey')
    await queryInterface.renameColumn('tasks', 'assignee_email', 'workeremail')
    await queryInterface.renameColumn('tasks', 'assignee_id', 'worker_id')
    await queryInterface.renameColumn('tasks', 'requester_email', 'useremail')
    await queryInterface.renameColumn('tasks', 'requester_id', 'user_id')
    await queryInterface.addConstraint('tasks', {
      fields: ['worker_id'],
      type: 'foreign key',
      name: 'tasks_worker_id_fkey',
      references: { table: 'workers', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    })
  },
}
