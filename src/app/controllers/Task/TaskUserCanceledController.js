import { Op } from 'sequelize';
import Task from '../../models/Task';
import File from '../../models/File';
import User from '../../models/User';
// Tasks I sent (requester) that were canceled.
class TaskUserCanceledController {
  async index(req, res) {
    const { assigneeNameFilter, nameFilter } = req.query;
    const tasks = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: req.userId,
        canceled_at: { [Op.ne]: null },
        name: { [Op.iLike]: `%${nameFilter}%` },
      },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'user_name', 'email'],
          where: {
            user_name: { [Op.like]: `%${assigneeNameFilter}%` },
          },
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

export default new TaskUserCanceledController();
