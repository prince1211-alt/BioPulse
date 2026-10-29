import { error as sendError } from '../utils/response.js';

export const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    return sendError(res, 'VALIDATION_ERROR', err.issues?.[0]?.message || 'Invalid request body', 400);
  }
};
