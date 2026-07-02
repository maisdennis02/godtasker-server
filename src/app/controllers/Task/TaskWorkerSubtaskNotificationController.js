import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';
import { subtaskProgress } from '../../utils/subtasks';

class TaskWorkerSubtaskNotificationController {
  // ---------------------------------------------------------------------------
  async update(req, res) {
    const { id } = req.params; // id: task_id
    const { position, text } = req.body;
    const {
      name,
      description,
      sub_task_list,
      task_attributes,
      messages,
      score,
      status,
      status_bar,
      start_date,
      initiated_at,
      messaged_at,
      canceled_at,
      due_date,
    } = req.body;

    let task = await Task.findByPk(id);
    const assignee = await User.findByPk(task.assignee_id);

    task = await task.update({
      name,
      description,
      sub_task_list,
      task_attributes,
      messages,
      score,
      status,
      status_bar,
      start_date,
      initiated_at,
      messaged_at,
      canceled_at,
      due_date,
    });

    // Keep the progress bar authoritative on the server, derived from the
    // subtasks the client just sent.
    task = await task.update({ status_bar: subtaskProgress(task.sub_task_list) });

    // Firebase Notification ***************************************************
    const requester = await User.findByPk(task.requester_id);

    // const formattedDate = fdate =>
    // fdate == null
    //   ? ''
    //   : format(fdate, "dd'/'MMM'/'yyyy HH:mm", { locale: ptBR });

    // console.log(task.sub_task_list);
    let pushMessage = {};
    try {
      pushMessage = {
        notification: {
          title: `${text[0]}: ${task.name}:`,
          body: `${assignee.user_name} ${
            task.sub_task_list[position].complete ? `${text[1]}` : `${text[3]}`
          } ${text[2]}: ${task.sub_task_list[position].description}`,
        },
        data: {
          channelId: 'godtaskerChannel01', // (required)
          title: `${text[0]}: ${task.name}:`,
          message: `${assignee.user_name} ${
            task.sub_task_list[position].complete ? `${text[1]}` : `${text[3]}`
          } ${text[2]}: ${task.sub_task_list[position].description}`,
        },
        android: {
          notification: {
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
        token: requester.notification_token,
      };

      if (requester.notification_token) {
        firebaseAdmin
          .messaging()
          .send(pushMessage)
          .catch(error => logger.error({ err: error }, 'FCM send failed'));
      }
    } catch (error) {
      logger.error(
        { err: error },
        'TaskWorkerSubtaskNotificationController.update'
      );
    }
    return res.json(task);
  }
}
export default new TaskWorkerSubtaskNotificationController();
