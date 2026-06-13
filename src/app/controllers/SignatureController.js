import Signature from '../models/Signature';
import signatureImgUpload from '../middlewares/signature';
// -----------------------------------------------------------------------------
class SignatureController {
  async store(req, res) {
    // Upload to AWS bucket
    signatureImgUpload(req, res, async error => {
      if (error) {
        res.json({ error });
      } else {
        // If File not found
        if (req.file === undefined) {
          res.json('Error: No File Selected');
        }
        // If Success
        const name = req.file.key;
        const path = req.file.location;
        await Signature.create({ name, path });
        const signature = await Signature.findOne({ where: { name } });
        // Save the file name into database into profile model
        res.json({
          image: name,
          location: path,
          signature_id: signature.id,
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  async index(req, res) {
    const { image } = req.query;
    const signatures = await Signature.findOne({
      where: {
        name: image,
      },
    });
    return res.json(signatures);
  }
}
export default new SignatureController();
