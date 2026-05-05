import { error as sendError } from '../utils/response.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const errorHandler = (err, req, res, next) => {
  console.error(err);
  
  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.statusCode);
  }

  if (err.name === 'ZodError') {
    return sendError(res, 'VALIDATION_ERROR', err.errors[0].message, 400);
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    return sendError(res, 'INVALID_ID', `Invalid ${err.path}: ${err.value}`, 400);
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const value = err.errmsg ? err.errmsg.match(/(["'])(\\?.)*?\1/)[0] : 'Duplicate field value';
    return sendError(res, 'DUPLICATE_ERROR', `Duplicate field value: ${value}. Please use another value!`, 400);
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((el) => el.message);
    return sendError(res, 'VALIDATION_ERROR', `Invalid input data. ${errors.join('. ')}`, 400);
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'INVALID_TOKEN', 'Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'TOKEN_EXPIRED', 'Your token has expired! Please log in again.', 401);
  }

  const message = env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  return sendError(res, 'SERVER_ERROR', message, 500);
};
