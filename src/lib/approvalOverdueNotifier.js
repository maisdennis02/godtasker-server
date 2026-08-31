import { Op } from 'sequelize';
import firebaseAdmin from 'firebase-admin';
import Task from '../app/models/Task';
import User from '../app/models/User';
import logger from './logger';

// A task sits in "awaiting approval" for at most this long before it counts as
// approval-overdue. Mirrored on the mobile client (features/tasks/util.ts) —
// keep the two in sync.
export const APPROVAL_TENURE_MS = 3 * 24 * 60 * 60 * 1000;

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

// "Approval overdue" itself is derived on read (approval_requested_at older
// than the tenure), like due-date overdue. This job only sends the one-time
// nag push to the requester when a task crosses the line; the stamp on
// approval_overdue_notified_at is what keeps it one-time.
async function notifyOverdueApprovals() {
  const cutoff = new Date(Date.now() - APPROVAL_TENURE_MS);

  const tasks = await Task.findAll({
    where: {
      approval_requested_at: { [Op.lt]: cutoff },
      approval_overdue_notified_at: null,
      end_date: null,
      canceled_at: null,
    },
    include: [
      {
        model: User,
        as: 'requester',
        attributes: ['id', 'user_name', 'notification_token'],
      },
      { model: User, as: 'assignee', attributes: ['id', 'user_name'] },
    ],
  });

  for (const task of tasks) {
    // Stamp first so a crash/restart can't double-send.
    await task.update({ approval_overdue_notified_at: new Date() });

    const token = task.requester?.notification_token;
    if (!token || firebaseAdmin.apps.length === 0) continue;

    const taskName = task.name ?? `task #${task.id}`;
    const title = task.assignee?.user_name || 'LalaTask';
    const body = `"${taskName}" has been awaiting your approval for 3 days`;

    firebaseAdmin
      .messaging()
      .send({
        notification: { title, body },
        data: {
          channelId: 'godtaskerChannel01', // (required)
          title,
          message: body,
        },
        android: { notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
        token,
      })
      .catch(error => logger.error({ err: error }, 'FCM send failed'));
  }

  if (tasks.length > 0) {
    logger.info({ count: tasks.length }, 'approval-overdue nags sent');
  }
}

export function startApprovalOverdueNotifier() {
  const run = () =>
    notifyOverdueApprovals().catch(err =>
      logger.error({ err }, 'approval-overdue check failed')
    );
  run();
  const timer = setInterval(run, CHECK_INTERVAL_MS);
  // Don't keep the process alive just for the timer.
  timer.unref?.();
  return timer;
}
