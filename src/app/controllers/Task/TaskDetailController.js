// import * as Yup from 'yup';
import Task from '../../models/Task';
import User from '../../models/User';
import File from '../../models/File';
// -----------------------------------------------------------------------------
class TaskDetailController {
  async update(req, res) {
    const { id } = req.params; // id: task_id.
    const { score } = req.body;
    let task = await Task.findByPk(id);
    if (!task.end_date) {
      return res.status(400).json({
        error: 'Update failed: Task must have end_date to receive score.',
      });
    }

    task = await task.update({
      score,
    });

    return res.json(task);
  }

  // ---------------------------------------------------------------------------
  // Filtered List. Pending
  async index(req, res) {
    const { id } = req.params;

    const tasks = await Task.findAll({
      where: {
        id,
      },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'user_name', 'email'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['name', 'path', 'url'],
            },
          ],
        },
      ],
    });
    return res.json(tasks);
  }
}
export default new TaskDetailController();
