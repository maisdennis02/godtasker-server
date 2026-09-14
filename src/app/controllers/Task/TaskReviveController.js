import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';
import { emitTaskChanged } from '../../../lib/taskEvents';
import { loadTaskFor } from '../../utils/taskAccess';

class TaskReviveController {
  async update(req, res) {
    const { id } = req.params;
    const { status } = req.body;

    let task = await loadTaskFor(Task, id, req, res);
    if (!task) return res;

    task = await task.update({
      canceled_at: null,
      status,
    });
    emitTaskChanged(task, 'revived');

    // Firebase Notification ***************************************************
    const requester = await User.findByPk(task.requester_id);
    const assignee = await User.findByPk(task.assignee_id);

    const pushMessage = {
      notification: {
        title: `${requester.user_name}`,
        body: `${task.status?.comment ?? ''}`,
      },
      data: {
        channelId: 'godtaskerChannel01', // (required)
        title: `${requester.user_name}:`,
        message: `${task.status?.comment ?? ''}`,
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
export default new TaskReviveController();
