import File from '../models/File';
import profileImgUpload from '../middlewares/profile';
// -----------------------------------------------------------------------------
class FileController {
  async store(req, res) {
    // Upload to AWS bucket
    profileImgUpload(req, res, async error => {
      if (error) {
        return res.status(400).json({ error: error.message || error });
      }
      // If File not found
      if (req.file === undefined) {
        return res.status(400).json({ error: 'No file selected' });
      }
      // If Success
      const imageName = req.file.key;
      const imageLocation = req.file.location;
      // Persist the File record and return its id so callers can link it
      // (e.g. as a User avatar via PUT /users { avatar_id }).
      const file = await File.create({
        name: imageName,
        path: imageLocation,
      });
      return res.json({
        id: file.id,
        image: imageName,
        location: imageLocation,
        url: file.url,
      });
    });
  }

  // ---------------------------------------------------------------------------
  async index(req, res) {
    const { image } = req.query;
    const files = await File.findAll({
      where: {
        name: image,
      },
    });
    return res.json(files);
  }
}
export default new FileController();
