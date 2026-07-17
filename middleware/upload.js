const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const resumeStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'job-portal/resumes',
    allowed_formats: ['pdf', 'doc', 'docx'],
    resource_type: 'raw',
  },
});

const logoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'job-portal/logos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill' }],
  },
});

const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'job-portal/images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

exports.uploadResume = multer({ storage: resumeStorage, limits: { fileSize: 5 * 1024 * 1024 } });
exports.uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } });
exports.uploadImage = multer({ storage: imageStorage, limits: { fileSize: 5 * 1024 * 1024 } });
exports.cloudinary = cloudinary;
