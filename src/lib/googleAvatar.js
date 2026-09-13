import { PutObjectCommand } from '@aws-sdk/client-s3';

import s3 from '../config/s3';
import File from '../app/models/File';
import logger from './logger';

// First Google sign-in on an account with no profile picture: copy the Google
// photo into our bucket and link it as the avatar, so the user doesn't start
// with a blank circle. Copying (not hot-linking) keeps <img> loads on our proxy
// and survives Google rotating the photo URL. Never overwrites an avatar the
// user chose themselves. Best-effort: any failure just leaves the avatar empty.
const MAX_BYTES = 2 * 1024 * 1024;

export async function importGoogleAvatar(user, pictureUrl) {
  if (!user || user.avatar_id || !pictureUrl) return null;
  try {
    // Google serves a small thumbnail by default (`=s96-c`); ask for a larger one.
    const url = pictureUrl.replace(/=s\d+(-c)?$/, '=s400-c');
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)/.test(contentType)) {
      throw new Error(`unexpected content-type ${contentType}`);
    }
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > MAX_BYTES) {
      throw new Error(`bad size ${body.length}`);
    }
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    // Same flat key shape as multer-s3 uploads (`<base>-<timestamp>.<ext>`), so
    // the /files/raw/:key proxy and the File.url virtual work unchanged.
    const key = `google-avatar-${user.id}-${Date.now()}.${ext}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    const file = await File.create({
      name: key,
      path: `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
    await user.update({ avatar_id: file.id });
    logger.info({ userId: user.id, key }, '[google-signin] avatar imported');
    return file;
  } catch (err) {
    logger.warn({ err: err.message, userId: user.id }, '[google-signin] avatar import skipped');
    return null;
  }
}
