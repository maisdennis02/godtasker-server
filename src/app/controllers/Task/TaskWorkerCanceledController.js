import { Op } from 'sequelize';
import Task from '../../models/Task';
import File from '../../models/File';
import User from '../../models/User';
// Tasks assigned to me (received) that were canceled.
class TaskWorkerCanceledController {
  async index(req, res) {
    const { nameFilter } = req.query;
    const tasks = await Task.findAll({
      where: {
        assignee_id: req.userId,
        canceled_at: { [Op.ne]: null },
        name: { [Op.iLike]: `%${nameFilter}%` },
      },
      order: ['due_date'],
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'user_name', 'email'],
          include: [
            { model: File, as: 'avatar', attributes: ['name', 'path', 'url'] },
          ],
        },
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'user_name', 'email'],
          include: [
            { model: File, as: 'avatar', attributes: ['name', 'path', 'url'] },
          ],
        },
      ],
    });
    return res.json(tasks);
  }
}

export default new TaskWorkerCanceledController();
