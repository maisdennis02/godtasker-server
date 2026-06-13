import createImageUploader from './s3Upload';

const profileImgUpload = createImageUploader({
  field: 'profileImage',
  maxBytes: 5_000_000,
});

export default profileImgUpload;
