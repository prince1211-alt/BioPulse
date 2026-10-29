import { disconnectUserSockets } from '../config/socket.js';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';

// Hash the complete JWT. bcrypt truncates inputs after 72 bytes.
export const hashRefreshToken = token => createHash('sha256').update(token).digest('hex');
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
  const { email, password, role, name, specialisation } = data;

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
    ...(validRole === 'doctor' ? { specialisation } : {}),
  });

  await user.save();

  const { accessToken, refreshToken } = generateTokens({
    id: user._id.toString(),
    role: user.role,
    version: user.token_version || 0,
  });

  const hashedRefreshToken = hashRefreshToken(refreshToken);
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
    await bcrypt.hash(password, 10); 
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
    version: user.token_version || 0,
  });

  const hashedRefreshToken = hashRefreshToken(refreshToken);
  await User.findByIdAndUpdate(user._id, {
    refresh_token: hashedRefreshToken,
    last_login: new Date(),
    token_version: user.token_version || 0,
  });

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
};

export const logoutUser = async (userId) => {
  disconnectUserSockets(userId);
  if (userId) {
    await User.findByIdAndUpdate(userId, { refresh_token: null, fcm_token: null, $inc: { token_version: 1 } });
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

  if (user.is_banned) throw new AppError('Your account has been suspended', 403, 'ACCOUNT_BANNED');
  if ((decoded.version || 0) !== (user.token_version || 0)) throw new AppError('Session expired', 401, 'INVALID_TOKEN');
  const isMatch = hashRefreshToken(token) === user.refresh_token;
  if (!isMatch) {
    
    await User.updateOne({ _id: user._id, refresh_token: user.refresh_token }, { refresh_token: null, $inc: { token_version: 1 } });
    throw new AppError('Token reuse detected, please login again', 401, 'TOKEN_REUSE');
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens({
    id: user._id.toString(),
    role: user.role,
    version: user.token_version || 0,
  });

  const hashedNew = hashRefreshToken(newRefreshToken);
  const rotated = await User.findOneAndUpdate(
    { _id: user._id, refresh_token: user.refresh_token, token_version: user.token_version || 0 },
    { refresh_token: hashedNew }
  );
  if (!rotated) throw new AppError('Session was already refreshed; retry with the current session', 401, 'INVALID_TOKEN');

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

  disconnectUserSockets(userId);
  user.password_hash = await bcrypt.hash(new_password, 10);
  user.token_version = (user.token_version || 0) + 1;
  user.refresh_token = null; 
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
  if (ban) disconnectUserSockets(userId);
  const user = await User.findByIdAndUpdate(
    userId,
    { is_banned: !!ban, ...(ban ? { refresh_token: null, $inc: { token_version: 1 } } : {}) },
    { returnDocument: 'after' }
  ).select('-password_hash -refresh_token');

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  return user;
};

export const updateFcmToken = async (userId, fcm_token) => {
  await User.updateMany({ _id: { $ne: userId }, fcm_token }, { $unset: { fcm_token: '' } });
  const user = await User.findByIdAndUpdate(userId, { fcm_token }, { returnDocument: 'after' });
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return { success: true };
};
