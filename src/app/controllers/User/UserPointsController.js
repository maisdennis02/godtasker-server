// -----------------------------------------------------------------------------
import User from '../../models/User';
// -----------------------------------------------------------------------------
class UserPointsController {
  async update(req, res) {
    const { id } = req.params;
    const { points } = req.body;

    const user = await User.findByPk(id);
    const sumPoints = user.points + points;

    await user.update({
      points: sumPoints,
    });

    return res.json({ user });
  }
}

export default new UserPointsController();
