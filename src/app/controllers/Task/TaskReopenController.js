import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';

// The requester sends a task back: either rejecting an approval request or
// reopening an already-completed task. Feedback is mandatory — the assignee
// must know what to change. Clears the completion state (and the proof photo,
// so redoing a photo task requires a fresh shot).
class TaskReopenController {
  async update(req, res) {
    const { id } = req.params;
    const { feedback, messageTitle } = req.body;

    let task = await Task.findByPk(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.requester_id !== req.userId) {
      return res
        .status(403)
        .json({ error: 'Only the requester can reopen this task.' });
    }
    if (task.canceled_at) {
      return res.status(400).json({ error: 'Task is canceled.' });
    }
    if (!task.end_date && !task.approval_requested_at) {
      return res.status(400).json({
        error: 'Only completed or awaiting-approval tasks can be reopened.',
      });
    }

    const trimmedFeedback = typeof feedback === 'string' ? feedback.trim() : '';
    if (!trimmedFeedback) {
      return res
        .status(400)
        .json({ error: 'Feedback is required to reopen a task.' });
    }

    task = await task.update({
      end_date: null,
      approval_requested_at: null,
      approval_overdue_notified_at: null,
      signature_id: null,
      reopened_at: new Date(),
      reopen_count: (task.reopen_count ?? 0) + 1,
      reopen_feedback: trimmedFeedback.slice(0, 2200),
    });

    // Firebase Notification ***************************************************
    const requester = await User.findByPk(task.requester_id);
    const assignee = await User.findByPk(task.assignee_id);

    const title = messageTitle || `${requester.user_name}`;
    const body = trimmedFeedback;

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
export default new TaskReopenController();
