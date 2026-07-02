import User from '../../models/User';
// -----------------------------------------------------------------------------
class UserUnblockController {
  async update(req, res) {
    const { email, unblocker_email } = req.body;

    const user = await User.findOne({
      where: { email },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // New array (filtered) so Sequelize persists the change.
    const blocked_list = (user.blocked_list ?? []).filter(
      e => e !== unblocker_email
    );

    await user.update({ blocked_list });

    return res.json(user);
  }
}
export default new UserUnblockController();
