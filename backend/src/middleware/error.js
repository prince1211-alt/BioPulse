import { error as sendError } from '../utils/response.js';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  console.error(err);
  
  if (err.name === 'ZodError') {
    return sendError(res, 'VALIDATION_ERROR', err.errors[0].message, 400);
  }

  const message = env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  return sendError(res, 'SERVER_ERROR', message, 500);
};
