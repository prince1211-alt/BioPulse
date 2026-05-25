import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

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
