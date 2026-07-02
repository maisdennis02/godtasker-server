// Helpers for the JSON `sub_task_list` on tasks. Each item is shaped like:
// { id, description, complete, order, weige_percentage }.

// A task is gated on completion only when it has subtasks. No subtasks (empty or
// null) => not gated, so this returns true.
export function allSubtasksComplete(list) {
  if (!Array.isArray(list) || list.length === 0) return true;
  return list.every(s => s && s.complete === true);
}

// Progress 0..100. Uses weige_percentage weights when present and summing > 0,
// otherwise falls back to an equal-weight fraction. Empty/invalid => 0.
export function subtaskProgress(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;

  const totalWeight = list.reduce((sum, s) => sum + (Number(s?.weige_percentage) || 0), 0);
  if (totalWeight > 0) {
    const doneWeight = list.reduce(
      (sum, s) => sum + (s?.complete ? Number(s.weige_percentage) || 0 : 0),
      0
    );
    return (doneWeight / totalWeight) * 100;
  }

  const done = list.filter(s => s && s.complete === true).length;
  return (done / list.length) * 100;
}
