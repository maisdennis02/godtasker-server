import File from '../models/File';
import profileImgUpload from '../middlewares/profile';
// -----------------------------------------------------------------------------
class FileController {
  async store(req, res) {
    // Upload to AWS bucket
    profileImgUpload(req, res, error => {
      // console.log('requestOkokok', req.file);
      if (error) {
        // console.log('errors', error);
        res.json({ error });
      } else {
        // If File not found
        if (req.file === undefined) {
          res.json('Error: No File Selected');
        }
        // If Success
        const imageName = req.file.key;
        const imageLocation = req.file.location;
        File.create({ name: imageName, path: imageLocation });
        // Save the file name into database into profile model
        res.json({
          image: imageName,
          location: imageLocation,
        });
      }
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
