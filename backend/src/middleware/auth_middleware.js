import { verifyToken } from '../utils/jwt.js';
import { error } from '../utils/response.js';
import { User } from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'NO_TOKEN', 'Authorization token required', 401);
    }

    const token   = authHeader.split(' ')[1];
    const decoded = verifyToken(token); 

    const user = await User.findById(decoded.id).select('role is_banned token_version').lean();
    if (!user || (decoded.version || 0) !== (user.token_version || 0)) {
      return error(res, 'INVALID_TOKEN', 'Session expired', 401);
    }
    if (user.is_banned) return error(res, 'ACCOUNT_BANNED', 'Your account has been suspended', 403);
    req.userId   = String(user._id);
    req.userRole = user.role;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'TOKEN_EXPIRED', 'Access token expired', 401);
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'CastError') {
      return error(res, 'INVALID_TOKEN', 'Invalid access token', 401);
    }
    next(err);
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
