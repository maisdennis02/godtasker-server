import { Op } from 'sequelize';

import Task from '../../models/Task';
import User from '../../models/User';
import File from '../../models/File';

// NOTE: `store` was a half-finished copy of Task_Controller.store and referenced
// undefined locals (`user_id`, `workeremail`, …). Stubbed to 501 until the
// message-notification flow is actually designed.
class MessageNotificationController {
  async store(req, res) {
    return res.status(501).json({
      error: 'MessageNotificationController.store is not implemented',
    });
  }

  async index(req, res) {
    const { assigneeNameFilter, requesterID } = req.query;
    const tasks = await Task.findAll({
      where: { requester_id: requesterID },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'user_name', 'email'],
          where: {
            user_name: { [Op.like]: `%${assigneeNameFilter}%` },
          },
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

  async update(req, res) {
    const { id } = req.params;
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

    const task = await Task.findByPk(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const updated = await task.update({
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

    return res.json(updated);
  }
}
export default new MessageNotificationController();
