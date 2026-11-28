// Content-Type the file proxy should answer with for a bucket object.
//
// multer-s3 sniffs the type from the bytes at upload time, and an AAC voice
// note in an .m4a container is stored as audio/x-m4a (or audio/m4a). Android
// plays that; iOS (AVPlayer and Safari) refuses anything but the registered
// type, audio/mp4. Rewriting at serve time also covers objects uploaded before
// this existed.
const M4A_EXTENSION = /\.m4a$/i;
const REWRITABLE = /^(audio\/(x-)?m4a|application\/octet-stream)$/i;

export function proxyContentType(key, storedType) {
  if (
    M4A_EXTENSION.test(key || '') &&
    (!storedType || REWRITABLE.test(storedType))
  ) {
    return 'audio/mp4';
  }
  return storedType || null;
}
