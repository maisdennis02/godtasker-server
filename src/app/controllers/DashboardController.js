import { Op } from 'sequelize';

import User from '../models/User';
import File from '../models/File';
import Task from '../models/Task';
import { countDueDates, resolveTimeZone } from '../utils/dueBuckets';

class DashboardController {
  // GET /dashboard/:id — always the signed-in user's own dashboard. The :id in
  // the path is kept for existing clients (they only ever pass their own id)
  // but ignored, so nobody can read another account's profile and counts.
  async index(req, res) {
    const id = req.userId;

    const user = await User.findByPk(id, {
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['name', 'path', 'url'],
        },
      ],
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // following count ---------------------------------------------------------
    // Exclude deactivated accounts (consistent with the followers count and the
    // People list) and the self-follow row so the count matches what the UI shows.
    const following = await user.getFollowing({
      where: { canceled_at: null, id: { [Op.ne]: id } },
    });
    const countFollowing = following.length;

    // followers count ---------------------------------------------------------
    const followers = await user.getFollowers({
      where: {
        canceled_at: null,
      },
    });
    const countFollowers = followers.length;

    // Tasks I sent (requester) and tasks I received (assignee).
    const user_id = id;
    const worker_id = id;
    const now = new Date();
    const timeZone = resolveTimeZone(req.query.tz);

    const userCountSent = await Task.count({
      where: {
        requester_id: user_id,
        canceled_at: null,
        end_date: null,
        initiated_at: null,
      },
    });

    // Rows (not a count) because the due-date buckets below need due_date.
    const userInitiated = await Task.findAll({
      attributes: ['due_date'],
      where: {
        requester_id: user_id,
        canceled_at: null,
        end_date: null,
        initiated_at: { [Op.ne]: null },
      },
    });

    const userCountFinished = await Task.count({
      where: {
        requester_id: user_id,
        canceled_at: null,
        end_date: { [Op.ne]: null },
      },
    });

    const userCountCanceled = await Task.count({
      where: { requester_id: user_id, canceled_at: { [Op.ne]: null } },
    });

    const userDue = countDueDates(
      userInitiated.map(i => i.due_date),
      now,
      timeZone
    );

    const workerCountReceived = await Task.count({
      where: {
        assignee_id: worker_id,
        canceled_at: null,
        end_date: null,
        initiated_at: null,
      },
    });

    // Rows (not a count) because the due-date buckets below need due_date.
    const workerInitiated = await Task.findAll({
      attributes: ['due_date'],
      where: {
        assignee_id: worker_id,
        canceled_at: null,
        end_date: null,
        initiated_at: { [Op.ne]: null },
      },
    });

    const workerCountFinished = await Task.count({
      where: {
        assignee_id: worker_id,
        canceled_at: null,
        end_date: { [Op.ne]: null },
      },
    });

    const workerCountCanceled = await Task.count({
      where: { assignee_id: worker_id, canceled_at: { [Op.ne]: null } },
    });

    const workerDue = countDueDates(
      workerInitiated.map(i => i.due_date),
      now,
      timeZone
    );

    return res.json({
      countFollowing,
      countFollowers,
      user,
      userCountSent,
      userCountInitiated: userInitiated.length,
      userCountFinished,
      userCountCanceled,
      userCountOverDue: userDue.overDue,
      userCountTodayDue: userDue.todayDue,
      userCountTomorrowDue: userDue.tomorrowDue,
      userCountThisWeekDue: userDue.thisWeekDue,
      workerCountReceived,
      workerCountInitiated: workerInitiated.length,
      workerCountFinished,
      workerCountCanceled,
      workerCountOverDue: workerDue.overDue,
      workerCountTodayDue: workerDue.todayDue,
      workerCountTomorrowDue: workerDue.tomorrowDue,
      workerCountThisWeekDue: workerDue.thisWeekDue,
    });
  }
}
export default new DashboardController();
