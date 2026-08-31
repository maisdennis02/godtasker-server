import { Op } from 'sequelize';
import Task from '../../models/Task';
import File from '../../models/File';
import User from '../../models/User';
import Signature from '../../models/Signature';
// Tasks I sent (requester) that are not yet finished.
class TaskUserUnfinishedController {
  async index(req, res) {
    const { assigneeNameFilter, nameFilter } = req.query;
    const parsedRequesterID = req.userId;
    const tasks = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: parsedRequesterID,
        canceled_at: null,
        end_date: null,
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
        {
          // Awaiting-approval tasks are still "unfinished" but may already carry
          // the proof photo the requester needs to see before approving.
          model: Signature,
          as: 'signature',
          attributes: ['name', 'path', 'url'],
        },
      ],
    });
    return res.json(tasks);
  }
}

export default new TaskUserUnfinishedController();
