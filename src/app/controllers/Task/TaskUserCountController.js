import { Op } from 'sequelize';
import Task from '../../models/Task';
import { countDueDates, resolveTimeZone } from '../../utils/dueBuckets';
// -----------------------------------------------------------------------------
class TaskUserCountController {
  async index(req, res) {
    // Owner comes from the auth token, not a client-supplied id.
    const requesterID = req.userId;

    const countSent = await Task.count({
      where: {
        requester_id: requesterID,
        canceled_at: null,
        end_date: null,
        initiated_at: null,
      },
    });

    // Rows (not a count) because the due-date buckets below need due_date.
    const initiated = await Task.findAll({
      attributes: ['due_date'],
      where: {
        requester_id: requesterID,
        canceled_at: null,
        end_date: null,
        initiated_at: { [Op.ne]: null },
      },
    });

    const countFinished = await Task.count({
      where: {
        requester_id: requesterID,
        canceled_at: null,
        end_date: { [Op.ne]: null },
      },
    });

    const countCanceled = await Task.count({
      where: { requester_id: requesterID, canceled_at: { [Op.ne]: null } },
    });

    const due = countDueDates(
      initiated.map(i => i.due_date),
      new Date(),
      resolveTimeZone(req.query.tz)
    );

    return res.json({
      countSent,
      countInitiated: initiated.length,
      countFinished,
      countCanceled,
      countOverDue: due.overDue,
      countTodayDue: due.todayDue,
      countTomorrowDue: due.tomorrowDue,
      countThisWeekDue: due.thisWeekDue,
    });
  }
}

export default new TaskUserCountController();
