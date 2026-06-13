import { Op } from 'sequelize';
import { addDays, endOfISOWeek } from 'date-fns';

import User from '../models/User';
import File from '../models/File';
import Task from '../models/Task';

class DashboardController {
  async index(req, res) {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['name', 'path', 'url'],
        },
      ],
    });

    // following count ---------------------------------------------------------
    const following = await user.getFollowing();
    const countFollowing = following.length;

    // followers count ---------------------------------------------------------
    const followers = await user.getFollowers({
      where: {
        canceled_at: null,
      },
    });
    const countFollowers = followers.length;

    // Tasks I sent (requester) and tasks I received (assignee). For one person
    // both ids are the same; the frontend still passes user_id/worker_id.
    const { user_id, worker_id } = req.query;

    const userSent = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: user_id,
        canceled_at: null,
        end_date: null,
        initiated_at: null,
      },
    });

    const userInitiated = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: user_id,
        canceled_at: null,
        end_date: null,
        initiated_at: { [Op.ne]: null },
      },
    });

    const userFinished = await Task.findAll({
      order: ['due_date'],
      where: {
        requester_id: user_id,
        canceled_at: null,
        end_date: { [Op.ne]: null },
      },
    });

    const userCanceled = await Task.findAll({
      order: ['due_date'],
      where: { requester_id: user_id, canceled_at: { [Op.ne]: null } },
    });

    function userOverDue() {
      const array = [];
      userInitiated.map(i => {
        if (i.due_date < new Date()) array.push(i.due_date);
        return array;
      });
      return array;
    }

    function userTodayDue() {
      const array = [];
      userInitiated.map(i => {
        if (i.due_date === new Date()) array.push(i.due_date);
        return array;
      });
      return array;
    }

    function userTomorrowDue() {
      const array = [];
      userInitiated.map(i => {
        if (i.due_date === addDays(new Date(), 1)) array.push(i.due_date);
        return array;
      });
      return array;
    }

    function userThisWeekDue() {
      const array = [];
      userInitiated.map(i => {
        if (i.due_date < endOfISOWeek(new Date()) && i.due_date > new Date()) {
          array.push(i.due_date);
        }
        return array;
      });
      return array;
    }

    const userCountSent = userSent.length;
    const userCountInitiated = userInitiated.length;
    const userCountFinished = userFinished.length;
    const userCountCanceled = userCanceled.length;
    const userCountOverDue = userOverDue().length;
    const userCountTodayDue = userTodayDue().length;
    const userCountTomorrowDue = userTomorrowDue().length;
    const userCountThisWeekDue = userThisWeekDue().length;

    const workerReceived = await Task.findAll({
      order: ['due_date'],
      where: {
        assignee_id: worker_id,
        canceled_at: null,
        end_date: null,
        initiated_at: null,
      },
    });

    const workerInitiated = await Task.findAll({
      order: ['due_date'],
      where: {
        assignee_id: worker_id,
        canceled_at: null,
        end_date: null,
        initiated_at: { [Op.ne]: null },
      },
    });

    const workerFinished = await Task.findAll({
      order: ['due_date'],
      where: {
        assignee_id: worker_id,
        canceled_at: null,
        end_date: { [Op.ne]: null },
      },
    });

    const workerCanceled = await Task.findAll({
      order: ['due_date'],
      where: { assignee_id: worker_id, canceled_at: { [Op.ne]: null } },
    });

    function workerOverDue() {
      const array = [];
      workerInitiated.map(i => {
        if (i.due_date < new Date()) array.push(i.due_date);
        return array;
      });
      return array;
    }

    function workerTodayDue() {
      const array = [];
      workerInitiated.map(i => {
        if (i.due_date === new Date()) array.push(i.due_date);
        return array;
      });
      return array;
    }

    function workerTomorrowDue() {
      const array = [];
      workerInitiated.map(i => {
        if (i.due_date === addDays(new Date(), 1)) array.push(i.due_date);
        return array;
      });
      return array;
    }

    function workerThisWeekDue() {
      const array = [];
      workerInitiated.map(i => {
        if (i.due_date < endOfISOWeek(new Date()) && i.due_date > new Date()) {
          array.push(i.due_date);
        }
        return array;
      });
      return array;
    }

    const workerCountReceived = workerReceived.length;
    const workerCountInitiated = workerInitiated.length;
    const workerCountFinished = workerFinished.length;
    const workerCountCanceled = workerCanceled.length;
    const workerCountOverDue = workerOverDue().length;
    const workerCountTodayDue = workerTodayDue().length;
    const workerCountTomorrowDue = workerTomorrowDue().length;
    const workerCountThisWeekDue = workerThisWeekDue().length;

    return res.json({
      countFollowing,
      countFollowers,
      user,
      userCountSent,
      userCountInitiated,
      userCountFinished,
      userCountCanceled,
      userCountOverDue,
      userCountTodayDue,
      userCountTomorrowDue,
      userCountThisWeekDue,
      workerCountReceived,
      workerCountInitiated,
      workerCountFinished,
      workerCountCanceled,
      workerCountOverDue,
      workerCountTodayDue,
      workerCountTomorrowDue,
      workerCountThisWeekDue,
    });
  }
}
export default new DashboardController();
