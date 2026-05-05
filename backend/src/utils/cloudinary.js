import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Cloudinary config will be picked up from process.env.CLOUDINARY_URL
// Or we can explicitly configure it if env vars are separate
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Storage engine
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'health-reports',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
    resource_type: 'auto',
  },
});

export const upload = multer({ storage: storage });

export const deleteCloudinaryObject = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`✅ [Cloudinary] Deleted: ${publicId}`);
  } catch (err) {
    console.error(`❌ [Cloudinary] Delete failed for ID "${publicId}":`, err.message);
  }
};
