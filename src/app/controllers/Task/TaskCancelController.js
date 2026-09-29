import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';
import pushText from '../../../lib/pushText';
import { emitTaskChanged } from '../../../lib/taskEvents';
import { loadTaskFor } from '../../utils/taskAccess';

class TaskCancelController {
  async update(req, res) {
    const { id } = req.params;
    const { status } = req.body;

    let task = await loadTaskFor(Task, id, req, res);
    if (!task) return res;

    // Only the requester calls a task off, and only while it's still open.
    // Offering tasks are a booking with the offering's owner, not the
    // requester's own task to withdraw.
    if (task.requester_id !== req.userId) {
      return res.status(403).json({ error: 'Only the requester can cancel this task' });
    }
    if (task.offering_id) {
      return res.status(409).json({ error: 'Tasks requested from an offering cannot be canceled' });
    }
    if (task.canceled_at || task.end_date) {
      return res.status(409).json({ error: 'This task is already closed' });
    }

    task = await task.update({
      canceled_at: new Date(),
      ...(status !== undefined && { status }),
    });
    emitTaskChanged(task, 'canceled');

    // Firebase Notification ***************************************************
    const requester = await User.findByPk(task.requester_id);
    const assignee = await User.findByPk(task.assignee_id);

    // Localized for the assignee (the recipient), ignoring any client copy.
    const title = requester.user_name;
    const body = pushText(assignee, 'taskCanceled', {
      name: task.name ?? `task #${task.id}`,
    });

    const pushMessage = {
      notification: {
        title,
        body,
      },
      data: {
        channelId: 'godtaskerChannel01', // (required)
        title,
        message: body,
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
export default new TaskCancelController();
