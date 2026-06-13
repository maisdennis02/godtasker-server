import { Op } from 'sequelize';
import Task from '../../models/Task';
import File from '../../models/File';
import User from '../../models/User';
// Tasks assigned to me (received) that are not yet finished.
class TaskWorkerUnfinishedController {
  async index(req, res) {
    const { assigneeID, nameFilter } = req.query;
    const tasks = await Task.findAll({
      order: ['due_date'],
      where: {
        assignee_id: assigneeID,
        canceled_at: null,
        end_date: null,
        name: { [Op.iLike]: `%${nameFilter}%` },
      },
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

export default new TaskWorkerUnfinishedController();
