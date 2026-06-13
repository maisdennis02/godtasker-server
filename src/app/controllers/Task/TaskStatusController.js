
import Task from '../../models/Task';
// -----------------------------------------------------------------------------
class TaskStatusController {
  async update(req, res) {
    const { id } = req.params; // id: task_id
    // console.log(id)
    const {
      name,
      description,
      sub_task_list,
      task_attributes,
      score,
      status,
      status_bar,
      start_date,
      initiated_at,
      canceled_at,
      due_date,
    } = req.body;

    let task = await Task.findByPk(id);

    task = await task.update({
      name,
      description,
      sub_task_list,
      task_attributes,
      score,
      status,
      status_bar,
      start_date,
      initiated_at,
      canceled_at,
      due_date,
    });

    return res.json(task);
  }

  // ---------------------------------------------------------------------------
}

export default new TaskStatusController();
