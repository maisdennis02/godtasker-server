import { GetObjectCommand } from '@aws-sdk/client-s3';

import File from '../models/File';
import profileImgUpload from '../middlewares/profile';
import s3 from '../../config/s3';
import logger from '../../lib/logger';
// -----------------------------------------------------------------------------
class FileController {
  // Public streaming proxy for bucket objects. The bucket has no public-read
  // policy, so <img src> can't hit S3 directly; the server (which holds
  // GetObject creds) fetches the object by key and streams it back. Keys are
  // flat (`name-timestamp.ext`), and Express `:key` can't contain a slash, so
  // there's no path-traversal surface.
  async raw(req, res) {
    const { key } = req.params;
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: process.env.AWS_BUCKET, Key: key })
      );
      if (obj.ContentType) res.set('Content-Type', obj.ContentType);
      // Immutable content (key includes a timestamp) — let clients/CDNs cache it.
      res.set('Cache-Control', 'public, max-age=86400, immutable');
      obj.Body.on('error', () => res.destroy()).pipe(res);
    } catch (err) {
      logger.debug({ err, key }, 'file proxy miss');
      return res.status(404).json({ error: 'Image not found' });
    }
  }

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
