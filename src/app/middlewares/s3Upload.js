import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';

import s3 from '../../config/s3';

const IMAGES = /jpeg|jpg|png|gif/;

// Both the extension and the mimetype must match `allowed`.
function fileFilterFor(allowed, message) {
  return (req, file, cb) => {
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    return cb(new Error(message));
  };
}

export default function createUploader({
  field,
  maxBytes,
  allowed = IMAGES,
  error = 'Only JPG, PNG, or GIF images are accepted.',
}) {
  return multer({
    storage: multerS3({
      s3,
      bucket: process.env.AWS_BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key(req, file, cb) {
        const base = path.basename(
          file.originalname,
          path.extname(file.originalname)
        );
        cb(null, `${base}-${Date.now()}${path.extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: maxBytes },
    fileFilter: fileFilterFor(allowed, error),
  }).single(field);
}
