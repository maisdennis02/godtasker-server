// The task list and count endpoints all filter on (requester_id|assignee_id,
// canceled_at, end_date); the table had no indexes at all, so every list was a
// sequential scan.
module.exports = {
  up: async queryInterface => {
    await queryInterface.addIndex('tasks', ['assignee_id', 'canceled_at', 'end_date'], {
      name: 'tasks_assignee_lifecycle_idx',
    })
    await queryInterface.addIndex('tasks', ['requester_id', 'canceled_at', 'end_date'], {
      name: 'tasks_requester_lifecycle_idx',
    })
  },

  down: async queryInterface => {
    await queryInterface.removeIndex('tasks', 'tasks_assignee_lifecycle_idx')
    await queryInterface.removeIndex('tasks', 'tasks_requester_lifecycle_idx')
  },
}
