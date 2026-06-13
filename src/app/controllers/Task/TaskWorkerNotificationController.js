import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';

class TaskWorkerNotificationController {
  // ---------------------------------------------------------------------------
  async update(req, res) {
    const { id } = req.params; // id: task_id
    // console.log(id)
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

    // Firebase Notification ***************************************************
    const requester = await User.findByPk(task.requester_id);
    const assignee = await User.findByPk(task.assignee_id);

    // const formattedDate = fdate =>
    // fdate == null
    //   ? ''
    //   : format(fdate, "dd'/'MMM'/'yyyy HH:mm", { locale: ptBR });

    let pushMessage = {};
    try {
      // When Worker Declines or Accepts the Task
      pushMessage = {
        notification: {
          title: `${assignee.user_name}:`,
          body: `${task.status.comment}`,
        },
        data: {
          channelId: 'godtaskerChannel01', // (required)
          title: `${assignee.user_name}:`,
          message: `${task.status.comment}`,
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
      logger.error({ err: error }, 'TaskWorkerNotificationController.update');
    }
    return res.json(task);
  }
}
export default new TaskWorkerNotificationController();
