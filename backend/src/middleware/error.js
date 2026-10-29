import { error as sendError } from '../utils/response.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const errorHandler = (err, req, res, next) => {
  console.error(err);
  
  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.statusCode);
  }

  if (err.name === 'ZodError') {
    return sendError(res, 'VALIDATION_ERROR', err.issues?.[0]?.message || 'Invalid request body', 400);
  }

  if (err.name === 'CastError') {
    return sendError(res, 'INVALID_ID', `Invalid ${err.path}: ${err.value}`, 400);
  }

  if (err.code === 11000) {
    return sendError(res, 'DUPLICATE_ERROR', 'A record with these unique fields already exists.', 409);
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((el) => el.message);
    return sendError(res, 'VALIDATION_ERROR', `Invalid input data. ${errors.join('. ')}`, 400);
  }

  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'INVALID_TOKEN', 'Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'TOKEN_EXPIRED', 'Your token has expired! Please log in again.', 401);
  }

  if (err.type === 'entity.parse.failed') return sendError(res, 'VALIDATION_ERROR', 'Invalid JSON body', 400);
  if (err.type === 'entity.too.large') return sendError(res, 'PAYLOAD_TOO_LARGE', 'Request body is too large', 413);
  if (err.name === 'MulterError') return sendError(res, 'UPLOAD_ERROR', err.message, err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);

  const message = env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  return sendError(res, 'SERVER_ERROR', message, 500);
};
