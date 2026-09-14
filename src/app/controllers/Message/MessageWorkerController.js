import Message from '../../models/Message';
import { loadCurrentUser } from '../../utils/currentUser';
// -----------------------------------------------------------------------------
class MessageWorkerController {
  async index(req, res) {
    const { user_email, worker_email } = req.query;
    let inverted = false;

    // Only look up conversations the signed-in user is part of.
    const me = await loadCurrentUser(req, res);
    if (!me) return null;
    if (me.email !== user_email && me.email !== worker_email) {
      return res.status(403).json({ error: 'You are not part of this conversation' });
    }

    let message = await Message.findOne({
      where: {
        user_email,
        worker_email,
      },
    });

    if (message === null) {
      message = await Message.findOne({
        where: {
          user_email: worker_email,
          worker_email: user_email,
        },
      });
      inverted = true;
      return res.json({ message, inverted });
    }
    return res.json({ message, inverted });
  }
}
export default new MessageWorkerController();
