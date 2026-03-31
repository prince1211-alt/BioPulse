import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  
  return { accessToken, refreshToken };
};

export const verifyToken = (token, isRefresh = false) => {
  return jwt.verify(token, isRefresh ? env.JWT_REFRESH_SECRET : env.JWT_SECRET);
};
