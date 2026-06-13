import Message from '../../models/Message';
// -----------------------------------------------------------------------------
class MessageUserController {
  async index(req, res) {
    const { user_email, worker_email } = req.query;
    let inverted = false;

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
export default new MessageUserController();
