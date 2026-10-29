import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { AppError } from './AppError.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => cb(['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)
    ? null : new AppError('Only JPEG, PNG and PDF reports are supported', 400, 'INVALID_FILE'), true),
});

export const uploadCloudinaryReport = file => {
  const bytes = file.buffer;
  const detected = bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : null;
  if (!detected || detected !== file.mimetype) throw new AppError('File contents do not match the declared type', 400, 'INVALID_FILE');
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) throw new AppError('Report storage is not configured', 503, 'STORAGE_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'health-reports', resource_type: 'auto', type: 'authenticated' }, (err, result) => err ? reject(err) : resolve(result));
    stream.end(bytes);
  });
};

export const reportDownloadUrl = report => report.cloudinary_public_id
  ? cloudinary.url(report.cloudinary_public_id, { resource_type: report.cloudinary_resource_type || 'image', type: report.cloudinary_delivery_type || 'authenticated', secure: true, sign_url: true })
  : report.file_url;

export const serializeReport = report => {
  const data = report.toObject ? report.toObject() : { ...report };
  return { ...data, file_url: reportDownloadUrl(data) };
};

export const deleteCloudinaryObject = async (publicId, resourceType = 'image', type = 'upload') => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type, invalidate: true });
};
