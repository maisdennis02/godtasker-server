module.exports = {
  up: async queryInterface => {
    const Sequelize = require('sequelize');
    // Copied from the offering at request time so the task keeps its fixed
    // length even if the offering changes later: due always = start + duration.
    await queryInterface.addColumn('tasks', 'duration_minutes', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    // Backfill tasks already spawned from a fixed-duration offering, and snap
    // their due date to start + duration while they're still open.
    await queryInterface.sequelize.query(`
      UPDATE tasks t
         SET duration_minutes = o.duration_minutes,
             due_date = CASE
               WHEN t.end_date IS NULL AND t.canceled_at IS NULL AND t.start_date IS NOT NULL
               THEN t.start_date + (o.duration_minutes || ' minutes')::interval
               ELSE t.due_date
             END
        FROM offerings o
       WHERE t.offering_id = o.id
         AND o.duration_minutes IS NOT NULL
         AND t.duration_minutes IS NULL
    `);
  },
  down: async queryInterface => {
    await queryInterface.removeColumn('tasks', 'duration_minutes');
  },
};
