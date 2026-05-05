import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { generateTokens, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';

const ROLE_PERMISSIONS = {
  patient: ['read:own_reports', 'write:own_reports', 'read:appointments', 'write:appointments', 'read:diet', 'write:diet', 'read:medicines', 'write:medicines'],
  doctor:  ['read:all_appointments', 'write:all_appointments', 'read:patient_reports', 'manage:slots', 'read:own_profile'],
  admin:   ['*'],
};

const sanitizeUser = (user) => {
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete obj.password_hash;
  delete obj.refresh_token;
  return obj;
};

export const registerUser = async (data) => {
  const { email, password, role, name, ...rest } = data;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('Email already in use', 400, 'EMAIL_EXISTS');
  }

  const validRole = role && ['patient', 'doctor'].includes(role) ? role : 'patient';
  const password_hash = await bcrypt.hash(password, 10);

  const user = new User({
    email: email.toLowerCase(),
    password_hash,
    role: validRole,
    name: name.trim(),
    permissions: ROLE_PERMISSIONS[validRole],
    ...rest,
  });

  await user.save();

  const { accessToken, refreshToken } = generateTokens({
    id: user._id.toString(),
    role: user.role,
  });

  const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  await User.findByIdAndUpdate(user._id, { refresh_token: hashedRefreshToken });

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
};

export const loginUser = async (email, password) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    await bcrypt.hash(password, 10); // Timing attack prevention
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  if (user.is_banned) {
    throw new AppError('Your account has been suspended', 403, 'ACCOUNT_BANNED');
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const { accessToken, refreshToken } = generateTokens({
    id: user._id.toString(),
    role: user.role,
  });

  const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  await User.findByIdAndUpdate(user._id, {
    refresh_token: hashedRefreshToken,
    last_login: new Date(),
  });

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
};

export const logoutUser = async (userId) => {
  if (userId) {
    await User.findByIdAndUpdate(userId, { refresh_token: null });
  }
};

export const refreshUserToken = async (token) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new AppError('Refresh token invalid or expired', 401, 'INVALID_TOKEN');
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.refresh_token) {
    throw new AppError('Session expired, please login again', 401, 'INVALID_TOKEN');
  }

  const isMatch = await bcrypt.compare(token, user.refresh_token);
  if (!isMatch) {
    // Token reuse detected - invalidate all sessions
    await User.findByIdAndUpdate(user._id, { refresh_token: null });
    throw new AppError('Token reuse detected, please login again', 401, 'TOKEN_REUSE');
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens({
    id: user._id.toString(),
    role: user.role,
  });

  const hashedNew = await bcrypt.hash(newRefreshToken, 10);
  await User.findByIdAndUpdate(user._id, { refresh_token: hashedNew });

  return { accessToken, refreshToken: newRefreshToken };
};

export const changeUserPassword = async (userId, current_password, new_password) => {
  if (current_password === new_password) {
    throw new AppError('New password must differ from current', 400, 'VALIDATION_ERROR');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const isValid = await bcrypt.compare(current_password, user.password_hash);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');
  }

  user.password_hash = await bcrypt.hash(new_password, 10);
  user.refresh_token = null; // Invalidate sessions
  await user.save();
};

export const verifyUserAuth = async (userId) => {
  const user = await User.findById(userId).select('-password_hash -refresh_token').lean();
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return user;
};

export const banUnbanUser = async (userId, ban) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { is_banned: !!ban, ...(ban ? { refresh_token: null } : {}) },
    { new: true }
  ).select('-password_hash -refresh_token');

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  return user;
};
