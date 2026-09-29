import { Op, literal } from 'sequelize';
import Task from '../../models/Task';
import File from '../../models/File';
import User from '../../models/User';
import Signature from '../../models/Signature';

const MAX_PAGE_SIZE = 50;
const OPEN = '"Task"."end_date" IS NULL AND "Task"."canceled_at" IS NULL';

// Escape LIKE wildcards so "50%" or "a_b" match literally.
const likeEscape = s => s.replace(/[\\%_]/g, c => `\\${c}`);

// Search one side of my tasks (sent or received) across every lifecycle
// state, matching the task name OR the other person's user name.
class TaskSearchController {
  async index(req, res) {
    const { side, q, limit, page } = req.query;
    if (side !== 'sent' && side !== 'received') {
      return res.status(400).json({ error: 'side must be "sent" or "received"' });
    }
    const term = typeof q === 'string' ? q.trim() : '';
    if (!term) return res.json([]);

    const sent = side === 'sent';
    const other = sent ? 'assignee' : 'requester';
    const pattern = `%${likeEscape(term)}%`;
    const pageSize = Math.min(parseInt(limit, 10) || 20, MAX_PAGE_SIZE);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * pageSize;

    // A fresh object per include: Sequelize mutates include options in place.
    const avatar = () => ({ model: File, as: 'avatar', attributes: ['name', 'path', 'url'] });
    const tasks = await Task.findAll({
      where: {
        [sent ? 'requester_id' : 'assignee_id']: req.userId,
        [Op.or]: [
          { name: { [Op.iLike]: pattern } },
          { [`$${other}.user_name$`]: { [Op.iLike]: pattern } },
        ],
      },
      // Open tasks first, soonest due; then closed ones, most recently closed.
      order: [
        [literal(`CASE WHEN ${OPEN} THEN 0 ELSE 1 END`), 'ASC'],
        [literal(`CASE WHEN ${OPEN} THEN "Task"."due_date" END`), 'ASC NULLS LAST'],
        [literal('COALESCE("Task"."canceled_at", "Task"."end_date")'), 'DESC'],
        ['id', 'DESC'],
      ],
      limit: pageSize,
      offset,
      // Flat join: all includes are belongsTo, and the $other.user_name$
      // filter must see the joined row, not a LIMITed subquery.
      subQuery: false,
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'user_name', 'email'],
          required: false,
          include: [avatar()],
        },
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'user_name', 'email'],
          required: false,
          include: [avatar()],
        },
        { model: Signature, as: 'signature', attributes: ['name', 'path', 'url'] },
      ],
    });
    return res.json(tasks);
  }
}

export default new TaskSearchController();
