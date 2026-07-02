import { Op } from 'sequelize';
import { format, startOfHour, parseISO, isBefore, subDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import firebaseAdmin from 'firebase-admin';

import User from '../../models/User';
import Task from '../../models/Task';
import File from '../../models/File';
import { io } from '../../../http';
import logger from '../../../lib/logger';
import { subtaskProgress } from '../../utils/subtasks';

class TaskController {
  async store(req, res) {
    const {
      assignee_email,
      name,
      description,
      sub_task_list,
      task_attributes,
      status,
      points,
      confirm_photo,
      start_date,
      due_date,
      created,
      due,
    } = req.body;

    const requester = await User.findByPk(req.userId);
    if (!requester || !requester.email) {
      return res
        .status(400)
        .json({ error: 'Create failed: User does not exist.' });
    }

    const assignee = await User.findOne({ where: { email: assignee_email } });
    if (!assignee) {
      return res
        .status(400)
        .json({ error: 'Create failed: Assignee does not exist.' });
    }

    const hourStart = startOfHour(parseISO(start_date));
    if (isBefore(hourStart, subDays(new Date(), 1))) {
      return res.status(400).json({ error: 'Past dates are not permitted' });
    }

    const task = await Task.create({
      requester_id: req.userId,
      requester_email: requester.email,
      assignee_id: assignee.id,
      assignee_email,
      name,
      description,
      sub_task_list,
      task_attributes,
      status,
      status_bar: subtaskProgress(sub_task_list),
      points,
      confirm_photo,
      start_date,
      due_date,
    });

    const parsedDueDate = format(parseISO(due_date), "MMM'/'dd'/'yyyy", {
      locale: enUS,
    });

    io.emit(`task_create_${assignee_email}`, 'Task Created');

    if (assignee.notification_token) {
      const pushMessage = {
        notification: {
          title: `${requester.user_name}`,
          body: `${created}: ${name} | ${due} ${parsedDueDate}`,
        },
        data: {
          channelId: 'godtaskerChannel01',
          title: `${requester.user_name}`,
          message: `${created}: ${name} | ${due} ${parsedDueDate}`,
        },
        android: { notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
        token: assignee.notification_token,
      };

      // Fire-and-forget — don't block the response on FCM.
      firebaseAdmin
        .messaging()
        .send(pushMessage)
        .catch(error => logger.error({ err: error }, 'FCM send failed'));
    }

    return res.json(task);
  }

  async index(req, res) {
    const { assigneeNameFilter } = req.query;
    const tasks = await Task.findAll({
      where: { requester_id: req.userId },
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
      // Derive progress from the subtasks when they're part of the update;
      // otherwise honor the value the client sent.
      status_bar:
        sub_task_list !== undefined ? subtaskProgress(sub_task_list) : status_bar,
      start_date,
      initiated_at,
      canceled_at,
      due_date,
    });

    return res.json(updated);
  }

  async delete(req, res) {
    const { id } = req.params;
    const task = await Task.findByPk(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await task.destroy();
    return res.json({ deleted: true, id });
  }
}

export default new TaskController();
