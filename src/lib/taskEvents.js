import { io } from '../http';
import logger from './logger';

// Real-time task sync. After every task mutation, both parties' sockets (each
// joined to `user_<id>` on connect, see server.js) hear that the task changed,
// so open clients refetch instead of waiting for their own next action. The
// payload is deliberately tiny: clients re-read through the normal REST
// endpoints, which keep every access rule in one place.
export function emitTaskChanged(task, action) {
  if (!task) return;
  try {
    const rooms = [task.requester_id, task.assignee_id]
      .filter(Boolean)
      .map(id => `user_${id}`);
    if (rooms.length === 0) return;
    // One emit to both rooms: a socket in both (self-assigned task) gets it once.
    io.to(rooms).emit('task:changed', { id: task.id, action });
  } catch (err) {
    // Never let a socket hiccup fail the request that already committed.
    logger.warn({ err, taskId: task.id }, 'task:changed emit failed');
  }
}
