import { verifyToken } from '../utils/jwt.js';
import { error } from '../utils/response.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'UNAUTHORIZED', 'No access token provided', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token, false);
    req.userId = payload.id;
    req.userRole = payload.role;
    next();
  } catch (err) {
    return error(res, 'TOKEN_EXPIRED', 'Access token is invalid or expired', 401);
  }
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return error(res, 'FORBIDDEN', 'You do not have permission to access this resource', 403);
    }
    next();
  };
};
