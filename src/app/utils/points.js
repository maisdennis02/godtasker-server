import Sequelize from 'sequelize';
import Task from '../models/Task';
import User from '../models/User';

// Credit a finished task's points to its assignee, exactly once. The stamp is
// a conditional UPDATE, so of two concurrent calls only one gets the row back
// and pays. Returns true only for the call that credited — callers use that to
// run other once-per-completion work (the next welcome task).
export const MAX_TASK_POINTS = 100;

// Points are set by whoever sends the task, so they're bounded at creation.
export function clampTaskPoints(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_TASK_POINTS);
}

export async function awardTaskPoints(task) {
  if (!(task.points > 0)) return false;
  // A task sent to yourself would let anyone print points.
  if (task.requester_id === task.assignee_id) return false;
  const [stamped] = await Task.update(
    { points_awarded_at: new Date() },
    { where: { id: task.id, points_awarded_at: null } }
  );
  if (stamped !== 1) return false;
  // Password sign-ups start with points NULL, and NULL + n is NULL in SQL.
  await User.update(
    { points: Sequelize.literal(`COALESCE(points, 0) + ${Number(task.points)}`) },
    { where: { id: task.assignee_id } }
  );
  return true;
}
