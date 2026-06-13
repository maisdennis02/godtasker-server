import createImageUploader from './s3Upload';

const signatureImgUpload = createImageUploader({
  field: 'signatureImage',
  maxBytes: 2_000_000,
});

export default signatureImgUpload;
