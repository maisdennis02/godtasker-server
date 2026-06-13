import { Op } from 'sequelize';
import { addDays, endOfISOWeek } from 'date-fns';
import Task from '../../models/Task';
// -----------------------------------------------------------------------------
class TaskUserCountController {
  async index(req, res) {
    const { requesterID } = req.query;
    // console.log(req.query)
    const parsedRequesterID = parseInt(requesterID);

    const sent = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: parsedRequesterID,
        canceled_at: null,
        end_date: null,
        initiated_at: null,
      },
    });

    const initiated = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: parsedRequesterID,
        canceled_at: null,
        end_date: null,
        initiated_at: { [Op.ne]: null },
      },
    });

    const finished = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: requesterID,
        canceled_at: null,
        end_date: { [Op.ne]: null },
      },
    });

    const canceled = await Task.findAll({
      order: ['due_date'],
      where: { requester_id: requesterID, canceled_at: { [Op.ne]: null } },
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

    const countSent = sent.length;
    const countInitiated = initiated.length;
    const countFinished = finished.length;
    const countCanceled = canceled.length;
    const countOverDue = overDue().length;
    const countTodayDue = todayDue().length;
    const countTomorrowDue = tomorrowDue().length;
    const countThisWeekDue = thisWeekDue().length;

    return res.json({
      countSent,
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

export default new TaskUserCountController();
