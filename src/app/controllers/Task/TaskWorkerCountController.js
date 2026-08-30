import { Op } from 'sequelize';
import { addDays, endOfISOWeek } from 'date-fns';
import Task from '../../models/Task';
// -----------------------------------------------------------------------------
class TaskWorkerCountController {
  async index(req, res) {
    // Owner comes from the auth token, not a client-supplied id.
    const assigneeID = req.userId;
    const parsedAssigneeID = req.userId;

    const countReceived = await Task.count({
      where: {
        assignee_id: parsedAssigneeID,
        canceled_at: null,
        end_date: null,
        initiated_at: null,
      },
    });

    // Rows (not a count) because the due-date buckets below need due_date.
    const initiated = await Task.findAll({
      attributes: ['due_date'],
      where: {
        assignee_id: parsedAssigneeID,
        canceled_at: null,
        end_date: null,
        initiated_at: { [Op.ne]: null },
      },
    });

    const countFinished = await Task.count({
      where: {
        assignee_id: assigneeID,
        canceled_at: null,
        end_date: { [Op.ne]: null },
      },
    });

    const countCanceled = await Task.count({
      where: { assignee_id: assigneeID, canceled_at: { [Op.ne]: null } },
    });

    function overDue() {
      const array = [];
      initiated.map(i => {
        if (i.due_date < new Date()) {
          array.push(i.due_date);
        }
      });
      return array;
    }

    function todayDue() {
      const array = [];
      initiated.map(i => {
        if (i.due_date === new Date()) {
          array.push(i.due_date);
        }
      });
      return array;
    }

    function tomorrowDue() {
      const array = [];
      initiated.map(i => {
        if (i.due_date === addDays(new Date(), 1)) {
          array.push(i.due_date);
        }
      });
      return array;
    }

    function thisWeekDue() {
      const array = [];
      initiated.map(i => {
        if (i.due_date < endOfISOWeek(new Date()) && i.due_date > new Date()) {
          array.push(i.due_date);
        }
      });
      return array;
    }

    const countInitiated = initiated.length;
    const countOverDue = overDue().length;
    const countTodayDue = todayDue().length;
    const countTomorrowDue = tomorrowDue().length;
    const countThisWeekDue = thisWeekDue().length;

    return res.json({
      countReceived,
      countInitiated,
      countFinished,
      countCanceled,
      countOverDue,
      countTodayDue,
      countTomorrowDue,
      countThisWeekDue,
    });
  }
}

export default new TaskWorkerCountController();
