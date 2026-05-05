import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import * as authService from '../services/auth.service.js';

const setTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body);
  setTokenCookie(res, result.refreshToken);
  return success(res, { user: result.user, accessToken: result.accessToken }, 'User registered successfully', 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.loginUser(email, password);
  setTokenCookie(res, result.refreshToken);
  return success(res, { user: result.user, accessToken: result.accessToken }, 'Login successful');
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logoutUser(req.userId);
  res.clearCookie('refreshToken');
  return success(res, { loggedOut: true }, 'Logout successful');
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    throw new AppError('Refresh token missing', 401, 'NO_TOKEN');
  }

  const result = await authService.refreshUserToken(token);
  setTokenCookie(res, result.refreshToken);
  return success(res, { accessToken: result.accessToken }, 'Token refreshed');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  await authService.changeUserPassword(req.userId, current_password, new_password);
  res.clearCookie('refreshToken');
  return success(res, { passwordChanged: true }, 'Password changed. Please login again.');
});

export const verifyAuth = asyncHandler(async (req, res) => {
  const user = await authService.verifyUserAuth(req.userId);
  return success(res, user, 'User verified successfully');
});

export const banUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { ban } = req.body; // true = ban, false = unban
  const user = await authService.banUnbanUser(userId, ban);
  return success(res, user, `User ${ban ? 'banned' : 'unbanned'} successfully`);
});

// Used by JWT middleware to validate stored refresh token hash
export const validateRefreshToken = async (userId, token) => {
  try {
    const bcrypt = await import('bcrypt');
    const { User } = await import('../models/User.js');
    const user = await User.findById(userId);
    if (!user || !user.refresh_token) return false;
    return await bcrypt.default.compare(token, user.refresh_token);
  } catch (err) {
    console.error('❌ Refresh Token Validation Error:', err);
    return false;
  }
};
