import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';

import s3 from '../../config/s3';

const ALLOWED = /jpeg|jpg|png|gif/;

function imageFileFilter(req, file, cb) {
  const extOk = ALLOWED.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = ALLOWED.test(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  return cb(new Error('Only JPG, PNG, or GIF images are accepted.'));
}

export default function createImageUploader({ field, maxBytes }) {
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
    fileFilter: imageFileFilter,
  }).single(field);
}
