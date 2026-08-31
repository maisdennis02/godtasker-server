import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';

// The requester signs off on an approval-required task: stamps end_date, which
// is the single "completed" signal everywhere else.
class TaskApproveController {
  async update(req, res) {
    const { id } = req.params;
    const { messageTitle, messageMessage } = req.body;

    let task = await Task.findByPk(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.requester_id !== req.userId) {
      return res
        .status(403)
        .json({ error: 'Only the requester can approve this task.' });
    }
    if (task.canceled_at) {
      return res.status(400).json({ error: 'Task is canceled.' });
    }
    if (task.end_date) {
      return res.status(400).json({ error: 'Task is already completed.' });
    }
    if (!task.approval_requested_at) {
      return res
        .status(400)
        .json({ error: 'The assignee has not requested approval yet.' });
    }

    task = await task.update({ end_date: new Date() });

    // Firebase Notification ***************************************************
    const requester = await User.findByPk(task.requester_id);
    const assignee = await User.findByPk(task.assignee_id);

    const title = messageTitle || `${requester.user_name}`;
    const body =
      messageMessage || `"${task.name ?? `task #${task.id}`}" was approved`;

    const pushMessage = {
      notification: { title, body },
      data: {
        channelId: 'godtaskerChannel01', // (required)
        title,
        message: body,
      },
      android: { notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
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
export default new TaskApproveController();
