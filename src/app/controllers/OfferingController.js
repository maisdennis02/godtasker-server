import firebaseAdmin from 'firebase-admin';
import Sequelize from 'sequelize';

import Offering from '../models/Offering';
import Task from '../models/Task';
import User from '../models/User';
import { io } from '../../http';
import logger from '../../lib/logger';
import { isBlockedBetween } from '../utils/blocks';

const SCHEDULE_KEYS = ['start_date', 'due_date', 'requester_sets_dates', 'max_requests'];

// Normalise the schedule/capacity fields shared by store and update.
// Returns { error } on bad input, otherwise the cleaned values.
function scheduleFields(body) {
  const requesterSetsDates = !!body.requester_sets_dates;
  // The creator's dates are meaningless when the requester picks them.
  const startDate = requesterSetsDates ? null : body.start_date || null;
  const dueDate = requesterSetsDates ? null : body.due_date || null;
  if (startDate && Number.isNaN(new Date(startDate).getTime())) {
    return { error: 'Invalid start date' };
  }
  if (dueDate && Number.isNaN(new Date(dueDate).getTime())) {
    return { error: 'Invalid due date' };
  }
  if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
    return { error: 'Due date must be after the start date' };
  }

  let maxRequests = null;
  if (body.max_requests !== undefined && body.max_requests !== null && body.max_requests !== '') {
    maxRequests = Number(body.max_requests);
    if (!Number.isInteger(maxRequests) || maxRequests < 1) {
      return { error: 'Max requests must be a whole number of at least 1' };
    }
  }

  return {
    start_date: startDate,
    due_date: dueDate,
    requester_sets_dates: requesterSetsDates,
    max_requests: maxRequests,
  };
}

// Active (not canceled) tasks spawned per offering, keyed by offering id.
async function requestCounts(offeringIds) {
  if (!offeringIds.length) return {};
  const rows = await Task.findAll({
    attributes: ['offering_id', [Sequelize.fn('COUNT', Sequelize.col('id')), 'n']],
    where: { offering_id: offeringIds, canceled_at: null },
    group: ['offering_id'],
    raw: true,
  });
  return Object.fromEntries(rows.map(r => [r.offering_id, Number(r.n)]));
}

class OfferingController {
  // Create an offering owned by the logged-in user.
  async store(req, res) {
    const {
      name,
      description,
      sub_task_list,
      task_attributes,
      price,
      confirm_photo_option,
      tenure,
      display_in_profile,
    } = req.body;

    const schedule = scheduleFields(req.body);
    if (schedule.error) return res.status(400).json({ error: schedule.error });

    const offering = await Offering.create({
      creator_id: req.userId,
      name,
      description,
      sub_task_list,
      task_attributes,
      price,
      confirm_photo_option,
      tenure,
      display_in_profile,
      ...schedule,
    });

    return res.json({ ...offering.toJSON(), request_count: 0 });
  }

  // ---------------------------------------------------------------------------
  // List a user's offerings (and the profile-visible subset).
  async index(req, res) {
    const { creator_id } = req.query;

    const offerings = await Offering.findAll({
      where: { creator_id, canceled_at: null },
      include: [
        { model: User, as: 'creator', attributes: ['id', 'user_name', 'email'] },
      ],
    });

    const displays = await Offering.findAll({
      where: { creator_id, display_in_profile: true, canceled_at: null },
    });

    const counts = await requestCounts(offerings.map(o => o.id));
    const withCount = list =>
      list.map(o => ({ ...o.toJSON(), request_count: counts[o.id] || 0 }));

    return res.json({ offerings: withCount(offerings), displays: withCount(displays) });
  }

  // ---------------------------------------------------------------------------
  async update(req, res) {
    const { id } = req.params;
    const {
      name,
      description,
      sub_task_list,
      task_attributes,
      price,
      confirm_photo_option,
      tenure,
      display_in_profile,
    } = req.body;

    let offering = await Offering.findByPk(id);
    if (!offering) return res.status(404).json({ error: 'Offering not found' });

    // Older clients (web) don't send schedule fields; leave them untouched
    // rather than wiping what was set from mobile.
    const touchesSchedule = SCHEDULE_KEYS.some(k => k in req.body);
    const schedule = touchesSchedule ? scheduleFields(req.body) : {};
    if (schedule.error) return res.status(400).json({ error: schedule.error });

    offering = await offering.update({
      name,
      description,
      sub_task_list,
      task_attributes,
      price,
      confirm_photo_option,
      tenure,
      display_in_profile,
      ...schedule,
    });

    const counts = await requestCounts([offering.id]);
    return res.json({ ...offering.toJSON(), request_count: counts[offering.id] || 0 });
  }

  // ---------------------------------------------------------------------------
  async delete(req, res) {
    const { id } = req.params;
    const offering = await Offering.findByPk(id);
    if (!offering) return res.status(404).json({ error: 'Offering not found' });

    await offering.destroy();
    return res.json({ deleted: true, id });
  }

  // ---------------------------------------------------------------------------
  // Request an offering -> spawn a Task assigned to the offering's creator.
  async request(req, res) {
    const { id } = req.params;

    const offering = await Offering.findByPk(id);
    if (!offering) return res.status(404).json({ error: 'Offering not found' });

    const requester = await User.findByPk(req.userId);
    const assignee = await User.findByPk(offering.creator_id);
    if (!requester || !assignee) {
      return res.status(400).json({ error: 'Requester or creator missing' });
    }

    // Blocking must actually block: no offering requests in either direction.
    if (isBlockedBetween(requester, assignee)) {
      return res
        .status(403)
        .json({ error: 'You cannot request offerings from this user' });
    }

    // Schedule: the creator's, or the requester's when the offering allows it.
    let startDate = offering.start_date;
    let dueDate = offering.due_date;
    if (offering.requester_sets_dates) {
      startDate = req.body.start_date || null;
      dueDate = req.body.due_date || null;
      if (startDate && Number.isNaN(new Date(startDate).getTime())) {
        return res.status(400).json({ error: 'Invalid start date' });
      }
      if (dueDate && Number.isNaN(new Date(dueDate).getTime())) {
        return res.status(400).json({ error: 'Invalid due date' });
      }
      if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
        return res.status(400).json({ error: 'Due date must be after the start date' });
      }
    } else if (dueDate && new Date(dueDate) < new Date()) {
      return res.status(409).json({ error: 'This offering has already ended' });
    }

    // Seat limit. Lock the offering row so two concurrent requests can't both
    // read "one seat left" and both get in.
    let task;
    try {
      task = await Offering.sequelize.transaction(async transaction => {
        if (offering.max_requests != null) {
          await Offering.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
          const taken = await Task.count({
            where: { offering_id: offering.id, canceled_at: null },
            transaction,
          });
          if (taken >= offering.max_requests) {
            const full = new Error('This offering is full');
            full.status = 409;
            throw full;
          }
        }
        return Task.create(
          {
            offering_id: offering.id,
            requester_id: requester.id,
            requester_email: requester.email,
            assignee_id: assignee.id,
            assignee_email: assignee.email,
            name: offering.name,
            description: offering.description,
            sub_task_list: offering.sub_task_list,
            task_attributes: offering.task_attributes,
            price: offering.price,
            confirm_photo: !!offering.confirm_photo_option,
            start_date: startDate,
            due_date: dueDate,
          },
          { transaction }
        );
      });
    } catch (err) {
      if (err.status === 409) return res.status(409).json({ error: err.message });
      logger.error({ err }, 'Offering request failed');
      return res.status(500).json({ error: 'Could not create the task' });
    }

    io.emit(`task_create_${assignee.email}`, 'Task Created');

    if (assignee.notification_token) {
      const pushMessage = {
        notification: {
          title: `${requester.user_name}`,
          body: `requested: ${offering.name}`,
        },
        data: {
          channelId: 'godtaskerChannel01',
          title: `${requester.user_name}`,
          message: `requested: ${offering.name}`,
        },
        android: { notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
        token: assignee.notification_token,
      };

      firebaseAdmin
        .messaging()
        .send(pushMessage)
        .catch(error => logger.error({ err: error }, 'FCM send failed'));
    }

    return res.json(task);
  }
}

export default new OfferingController();
