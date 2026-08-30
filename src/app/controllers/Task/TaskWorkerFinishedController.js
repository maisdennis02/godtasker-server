import { Op } from 'sequelize';
import Task from '../../models/Task';
import File from '../../models/File';
import User from '../../models/User';
import Signature from '../../models/Signature';
// Tasks assigned to me (received) that are finished.
class TaskWorkerFinishedController {
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
      order: [['end_date', 'DESC']],
      ...pagination,
      where: {
        assignee_id: req.userId,
        canceled_at: null,
        end_date: { [Op.ne]: null },
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
        {
          model: Signature,
          as: 'signature',
          attributes: ['name', 'path', 'url'],
        },
      ],
    });
    return res.json(tasks);
  }
}

export default new TaskWorkerFinishedController();
