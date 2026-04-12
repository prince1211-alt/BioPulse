import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// ─── Generate both tokens ─────────────────────────────────────────────────────

export const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// ─── Verify access token ──────────────────────────────────────────────────────

export const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

// ─── Verify refresh token — used by refreshAccessToken controller ─────────────

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};
