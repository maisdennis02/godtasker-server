import firebaseAdmin from 'firebase-admin';

import Offering from '../models/Offering';
import Task from '../models/Task';
import User from '../models/User';
import { io } from '../../http';
import logger from '../../lib/logger';

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
    });

    return res.json(offering);
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

    return res.json({ offerings, displays });
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

    offering = await offering.update({
      name,
      description,
      sub_task_list,
      task_attributes,
      price,
      confirm_photo_option,
      tenure,
      display_in_profile,
    });

    return res.json(offering);
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

    const task = await Task.create({
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
    });

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
