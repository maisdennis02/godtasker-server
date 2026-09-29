import createUploader from './s3Upload';

// Chat voice notes. Mobile records AAC in an .m4a container; the web may send
// webm/ogg. Two minutes of 64 kbps AAC is ~1 MB — 5 MB leaves headroom.
const audioUpload = createUploader({
  field: 'audioFile',
  maxBytes: 5_000_000,
  allowed: /m4a|mp4|aac|mpeg|mp3|webm|ogg|wav/,
  error: 'Only audio files are accepted.',
});

export default audioUpload;
