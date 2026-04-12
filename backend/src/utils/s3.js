import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

// ─── Client ───────────────────────────────────────────────────────────────────

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId:     env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET      = env.AWS_S3_BUCKET;
const REGION      = env.AWS_REGION;
const URL_EXPIRY  = 3600;         // presigned URL expires in 1 hour
const MAX_BYTES   = 20 * 1024 * 1024; // 20 MB max upload

// ─── generatePresignedUrl ─────────────────────────────────────────────────────

/**
 * Returns a presigned PUT URL the client uses to upload directly to S3,
 * plus the permanent public file URL.
 *
 * @param {string} filename    - sanitized filename
 * @param {string} contentType - MIME type
 * @param {string} [userId]    - optional, used to namespace the S3 key
 */
export const generatePresignedUrl = async (filename, contentType, userId = 'anonymous') => {
  if (!BUCKET || !REGION) {
    throw new Error('S3 bucket configuration missing (AWS_S3_BUCKET / AWS_REGION)');
  }

  // Namespace by userId + date to avoid collisions and aid cleanup
  const date    = new Date().toISOString().slice(0, 10); // e.g. 2025-04-01
  const key     = `health-reports/${userId}/${date}/${Date.now()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket:        BUCKET,
    Key:           key,
    ContentType:   contentType,
    ContentLength: MAX_BYTES, // S3 enforces the upload won't exceed this
    // Server-side encryption at rest
    ServerSideEncryption: 'AES256',
  });

  try {
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: URL_EXPIRY });
    const fileUrl   = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl, key, expiresIn: URL_EXPIRY };
  } catch (err) {
    console.error('❌ [S3] Failed to generate presigned URL:', err.message);
    throw new Error('S3_PRESIGN_FAILED');
  }
};

// ─── deleteObject ─────────────────────────────────────────────────────────────

/**
 * Deletes an object from S3 by its full file URL or key.
 * Used when a report is deleted by the user.
 *
 * @param {string} fileUrlOrKey - full S3 URL or just the key path
 */
export const deleteS3Object = async (fileUrlOrKey) => {
  let key = fileUrlOrKey;

  // Extract key from full URL if needed
  if (fileUrlOrKey.startsWith('https://')) {
    const url  = new URL(fileUrlOrKey);
    key        = url.pathname.slice(1); // remove leading '/'
  }

  try {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
    );
    console.log(`✅ [S3] Deleted: ${key}`);
  } catch (err) {
    console.error(`❌ [S3] Delete failed for key "${key}":`, err.message);
    // Don't throw — if S3 delete fails the DB record is already removed
  }
};

// ─── checkObjectExists ────────────────────────────────────────────────────────

/**
 * Checks whether a given S3 key exists (HEAD request).
 * Useful to verify a report was actually uploaded before processing.
 *
 * @param {string} fileUrl - full S3 URL
 * @returns {Promise<boolean>}
 */
export const checkS3ObjectExists = async (fileUrl) => {
  try {
    const url = new URL(fileUrl);
    const key = url.pathname.slice(1);

    await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key })
    );
    return true;
  } catch {
    return false;
  }
};
