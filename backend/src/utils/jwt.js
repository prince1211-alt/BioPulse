import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d', jwtid: randomUUID() });
  return { accessToken, refreshToken };
};

export const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};
