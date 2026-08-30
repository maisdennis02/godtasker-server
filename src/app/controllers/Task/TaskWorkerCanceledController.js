import { Op } from 'sequelize';
import Task from '../../models/Task';
import File from '../../models/File';
import User from '../../models/User';
// Tasks assigned to me (received) that were canceled.
class TaskWorkerCanceledController {
  async index(req, res) {
    const { nameFilter, limit, page } = req.query;
    // Pagination is opt-in: clients that don't send `limit` (vc10 and older)
    // still get the full list.
    const pageSize = parseInt(limit, 10);
    const pagination =
      pageSize > 0
        ? { limit: pageSize, offset: (Math.max(parseInt(page, 10) || 1, 1) - 1) * pageSize }
        : {};
    const tasks = await Task.findAll({
      where: {
        assignee_id: req.userId,
        canceled_at: { [Op.ne]: null },
        name: { [Op.iLike]: `%${nameFilter}%` },
      },
      order: [['canceled_at', 'DESC']],
      ...pagination,
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
