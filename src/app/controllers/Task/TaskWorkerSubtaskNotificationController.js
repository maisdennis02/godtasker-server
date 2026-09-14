import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';
import { subtaskProgress } from '../../utils/subtasks';
import pushText from '../../../lib/pushText';
import { emitTaskChanged } from '../../../lib/taskEvents';
import { loadTaskFor } from '../../utils/taskAccess';

class TaskWorkerSubtaskNotificationController {
  // ---------------------------------------------------------------------------
  async update(req, res) {
    const { id } = req.params; // id: task_id
    const { position } = req.body;
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

    let task = await loadTaskFor(Task, id, req, res);
    if (!task) return res;
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
    emitTaskChanged(task, 'subtask');

    // Firebase Notification ***************************************************
    const requester = await User.findByPk(task.requester_id);

    // const formattedDate = fdate =>
    // fdate == null
    //   ? ''
    //   : format(fdate, "dd'/'MMM'/'yyyy HH:mm", { locale: ptBR });

    // console.log(task.sub_task_list);
    let pushMessage = {};
    try {
      // Localized for the requester (users.locale); the client's `text` labels
      // are ignored so the recipient never gets the sender's language.
      const subtask = task.sub_task_list?.[position] ?? {};
      const pushTitle = pushText(requester, 'subtaskTitle', { name: task.name });
      const pushBody = pushText(
        requester,
        subtask.complete ? 'subtaskDone' : 'subtaskReopened',
        { who: assignee.user_name, desc: subtask.description ?? '' }
      );
      pushMessage = {
        notification: {
          title: pushTitle,
          body: pushBody,
        },
        data: {
          channelId: 'godtaskerChannel01', // (required)
          title: pushTitle,
          message: pushBody,
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
