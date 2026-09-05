import firebaseAdmin from 'firebase-admin';
import Sequelize from 'sequelize';

import Offering from '../models/Offering';
import Task from '../models/Task';
import User from '../models/User';
import { io } from '../../http';
import logger from '../../lib/logger';
import { isBlockedBetween } from '../utils/blocks';
import { parseAvailability, availabilityViolation } from '../utils/availability';

const SCHEDULE_KEYS = [
  'start_date',
  'due_date',
  'requester_sets_dates',
  'max_requests',
  'duration_minutes',
  'availability',
];

const MINUTE_MS = 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

// Normalise the schedule/capacity fields shared by store and update.
// Returns { error } on bad input, otherwise the cleaned values.
function scheduleFields(body) {
  const requesterSetsDates = !!body.requester_sets_dates;

  let durationMinutes = null;
  if (body.duration_minutes !== undefined && body.duration_minutes !== null && body.duration_minutes !== '') {
    durationMinutes = Number(body.duration_minutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      return { error: 'Duration must be a whole number of minutes, at least 1' };
    }
  }

  // The creator's dates are kept even when the requester may change them:
  // they act as the defaults offered in the request step.
  const startDate = parseDate(body.start_date);
  if (startDate === undefined) return { error: 'Invalid start date' };
  let dueDate = parseDate(body.due_date);
  if (dueDate === undefined) return { error: 'Invalid due date' };
  if (durationMinutes) {
    // A fixed duration derives the due date; whatever the client sent is ignored.
    dueDate = startDate ? addMinutes(startDate, durationMinutes) : null;
  } else if (startDate && dueDate && dueDate < startDate) {
    return { error: 'Due date must be after the start date' };
  }

  let maxRequests = null;
  if (body.max_requests !== undefined && body.max_requests !== null && body.max_requests !== '') {
    maxRequests = Number(body.max_requests);
    if (!Number.isInteger(maxRequests) || maxRequests < 1) {
      return { error: 'Max requests must be a whole number of at least 1' };
    }
  }

  // A window only means something when the requester picks the start.
  const availability = requesterSetsDates ? parseAvailability(body.availability) : { value: null };
  if (availability.error) return { error: availability.error };
  if (availability.value && durationMinutes) {
    const [fh, fm] = availability.value.from.split(':').map(Number);
    const [th, tm] = availability.value.to.split(':').map(Number);
    if (th * 60 + tm - (fh * 60 + fm) < durationMinutes) {
      return { error: 'The availability window is shorter than the duration' };
    }
  }

  return {
    start_date: startDate,
    due_date: dueDate,
    requester_sets_dates: requesterSetsDates,
    max_requests: maxRequests,
    duration_minutes: durationMinutes,
    availability: availability.value,
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

    // Schedule. The creator's dates are the baseline; when the offering lets
    // the requester set dates, the body may override them (inside the
    // availability window). A fixed duration always derives the due date.
    const requesterMay = !!offering.requester_sets_dates;
    let startDate = offering.start_date;
    let dueDate = offering.due_date;
    let requesterChose = false;
    if (requesterMay) {
      if (req.body.start_date !== undefined) {
        const parsed = parseDate(req.body.start_date);
        if (parsed === undefined) return res.status(400).json({ error: 'Invalid start date' });
        startDate = parsed;
        requesterChose = true;
      }
      if (req.body.due_date !== undefined) {
        const parsed = parseDate(req.body.due_date);
        if (parsed === undefined) return res.status(400).json({ error: 'Invalid due date' });
        dueDate = parsed;
        requesterChose = true;
      }
    }
    if (offering.duration_minutes) {
      dueDate = startDate ? addMinutes(startDate, offering.duration_minutes) : null;
    } else if (startDate && dueDate && dueDate < startDate) {
      return res.status(400).json({ error: 'Due date must be after the start date' });
    }
    if (requesterMay && offering.availability && startDate) {
      const why = availabilityViolation(offering.availability, startDate, offering.duration_minutes);
      if (why) return res.status(400).json({ error: why });
    }
    if (!requesterChose && dueDate && dueDate < new Date()) {
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
