import { Op } from 'sequelize';
import User from '../../models/User';
import File from '../../models/File';
import Offering from '../../models/Offering';
import { loadCurrentUser } from '../../utils/currentUser';
import { publicUser } from '../../utils/publicUser';
import { VISIBLE_IN_PROFILE } from '../../utils/offeringVisibility';

// A person's presentation page: who they are, how many people follow them
// and how much they offer. The offerings themselves come from GET /offerings.
class UserProfileController {
  async index(req, res) {
    const me = await loadCurrentUser(req, res);
    if (!me) return null;

    const user = await User.findOne({
      where: { id: Number(req.params.id) || 0, canceled_at: null },
      include: [{ model: File, as: 'avatar', attributes: ['name', 'path', 'url'] }],
    });
    const isSelf = !!user && user.id === me.id;
    // Someone who blocked me simply isn't there, so the block isn't revealed.
    const blockedMe = !!user && (user.blocked_list || []).includes(me.email);
    if (!user || (blockedMe && !isSelf)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [followers, following, offerings, followsThem] = await Promise.all([
      user.countFollowers({ where: { canceled_at: null } }),
      user.countFollowing({ where: { canceled_at: null, id: { [Op.ne]: user.id } } }),
      Offering.count({
        where: {
          creator_id: user.id,
          canceled_at: null,
          // The owner sees everything they offer; visitors only what's shown.
          ...(isSelf ? {} : VISIBLE_IN_PROFILE),
        },
      }),
      isSelf ? false : me.hasFollowing(user.id),
    ]);

    return res.json({
      user: publicUser(user, me),
      counts: { offerings, followers, following },
      is_self: isSelf,
      is_following: followsThem,
      blocked_by_me: (me.blocked_list || []).includes(user.email),
    });
  }
}

export default new UserProfileController();
