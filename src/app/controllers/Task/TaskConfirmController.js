import firebaseAdmin from 'firebase-admin';
import Task from '../../models/Task';
import User from '../../models/User';
import logger from '../../../lib/logger';
import { allSubtasksComplete } from '../../utils/subtasks';
import pushText from '../../../lib/pushText';

class TaskConfirmController {
  async update(req, res) {
    const { id } = req.params; // id: task_id.
    const { signature_id, score } = req.body;

    let task = await Task.findByPk(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Only the assignee finishes a task.
    if (task.assignee_id !== req.userId) {
      return res
        .status(403)
        .json({ error: 'Only the assignee can complete this task.' });
    }

    // A task can only be ended once every subtask is done. Tasks without
    // subtasks are not gated.
    if (!allSubtasksComplete(task.sub_task_list)) {
      return res.status(400).json({
        error: 'Cannot complete: all subtasks must be done first.',
      });
    }

    // Photo-proof tasks can only be ended with an attached confirmation photo.
    if (task.confirm_photo && !signature_id) {
      return res.status(400).json({
        error: 'Cannot complete: a confirmation photo is required.',
      });
    }

    if (task.approval_required) {
      // The requester asked to sign off on completion: park the task as
      // "awaiting approval" instead of ending it. end_date is only stamped by
      // TaskApproveController, so the task stays on the unfinished lists where
      // the requester can approve or reopen it.
      task = await task.update({
        approval_requested_at: new Date(),
        approval_overdue_notified_at: null,
        signature_id,
        score,
      });
    } else {
      task = await task.update({
        end_date: new Date(),
        signature_id,
        score,
      });
    }

    // Firebase Notification ***************************************************
    // The assignee is the one confirming, so the requester gets the push.
    const requester = await User.findByPk(task.requester_id);

    // FCM rejects non-string data values, so never let undefined through.
    const taskName = task.name ?? `task #${task.id}`;
    // Localized for the requester (the recipient), ignoring any client copy.
    const title = pushText(
      requester,
      task.approval_required ? 'approvalRequested' : 'taskCompleted'
    );
    const body = pushText(
      requester,
      task.approval_required ? 'awaitingApproval' : 'markedDone',
      { name: taskName }
    );

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
      token: requester.notification_token,
    };

    if (requester.notification_token) {
      firebaseAdmin
        .messaging()
        .send(pushMessage)
        .catch(error => logger.error({ err: error }, 'FCM send failed'));
    }

    return res.json(task);
  }
}
export default new TaskConfirmController();
