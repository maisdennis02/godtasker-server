import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';

class TaskConfirmController {
  async update(req, res) {
    const { id } = req.params; // id: task_id.
    const end_date = new Date();
    const { signature_id, score, messageTitle, messageMessage } = req.body;

    let task = await Task.findByPk(id);

    task = await task.update({
      end_date,
      signature_id,
      score,
    });

    // Firebase Notification ***************************************************
    const assignee = await User.findByPk(task.assignee_id);

    const pushMessage = {
      notification: {
        title: messageTitle,
        body: messageMessage,
      },
      data: {
        channelId: 'godtaskerChannel01', // (required)
        title: messageTitle,
        message: messageMessage,
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
      token: assignee.notification_token,
    };

    if (assignee.notification_token) {
      firebaseAdmin
        .messaging()
        .send(pushMessage)
        .catch(error => logger.error({ err: error }, 'FCM send failed'));
    }

    return res.json(task);
  }
}
export default new TaskConfirmController();
