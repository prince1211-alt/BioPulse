import { verifyToken } from '../utils/jwt.js';
import { error } from '../utils/response.js';

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'NO_TOKEN', 'Authorization token required', 401);
    }

    const token   = authHeader.split(' ')[1];
    const decoded = verifyToken(token); 

    req.userId   = decoded.id;
    req.userRole = decoded.role;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'TOKEN_EXPIRED', 'Access token expired', 401);
    }
    return error(res, 'INVALID_TOKEN', 'Invalid access token', 401);
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.userRole) {
    return error(res, 'NO_TOKEN', 'Not authenticated', 401);
  }

  if (!roles.includes(req.userRole)) {
    return error(
      res,
      'FORBIDDEN',
      `Access denied. Required role(s): ${roles.join(', ')}`,
      403
    );
  }

  next();
};

export const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = verifyToken(authHeader.split(' ')[1]);
      req.userId   = decoded.id;
      req.userRole = decoded.role;
    }
  } catch {
    
  }
  next();
};

