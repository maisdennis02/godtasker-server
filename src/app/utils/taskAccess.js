// A task belongs to exactly two people: the requester who sent it and the
// assignee who does it. Every read or mutation by id must be limited to them,
// otherwise any signed-in account can reach any task by guessing the id (IDOR).
// Both clients only ever act on tasks as one of the two parties, so this check
// is invisible to legitimate traffic.
export function isParticipant(task, userId) {
  if (!task) return false;
  return task.requester_id === userId || task.assignee_id === userId;
}

// Shared "load or reject" for the by-id task endpoints. Sends the response and
// returns null when the caller may not touch the task.
export async function loadTaskFor(TaskModel, id, req, res) {
  const task = await TaskModel.findByPk(id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }
  if (!isParticipant(task, req.userId)) {
    res.status(403).json({ error: 'You are not part of this task' });
    return null;
  }
  return task;
}
