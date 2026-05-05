import { AppError } from '../utils/AppError.js';
import * as userRepo from '../repositories/user.repository.js';

const PATIENT_ALLOWED_FIELDS = [
  'name', 'age', 'gender', 'height', 'weight',
  'calorie_goal', 'fcm_token', 'avatar_url',
  'blood_group', 'allergies', 'chronic_conditions', 'emergency_contact',
];
const DOCTOR_ALLOWED_FIELDS = [
  'name', 'fcm_token', 'avatar_url',
  'specialisation', 'qualification', 'experience_years',
  'bio', 'consultation_fee', 'clinic_address', 'phone',
];
const ADMIN_ALLOWED_FIELDS = [...PATIENT_ALLOWED_FIELDS, ...DOCTOR_ALLOWED_FIELDS, 'role'];
const getAllowedFields = (role) => {
  if (role === 'admin')  return ADMIN_ALLOWED_FIELDS;
  if (role === 'doctor') return DOCTOR_ALLOWED_FIELDS;
  return PATIENT_ALLOWED_FIELDS;
};

export const getUserProfile = async (userId) => {
  const user = await userRepo.findUserById(userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return user;
};

export const updateUserProfile = async (userId, role, data) => {
  const allowedFields = getAllowedFields(role);
  const updateData = {};
  allowedFields.forEach((field) => { if (data[field] !== undefined) updateData[field] = data[field]; });
  if (Object.keys(updateData).length === 0) throw new AppError('No valid fields provided', 400, 'VALIDATION_ERROR');
  const user = await userRepo.updateUserById(userId, updateData);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return user;
};

export const getDoctorProfile = async (doctorId) => {
  const doctor = await userRepo.findDoctorById(doctorId);
  if (!doctor) throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  return doctor;
};

export const getAllUsers = async (roleFilter, page = 1, limit = 20) => {
  const filter = {};
  if (roleFilter && ['patient', 'doctor', 'admin'].includes(roleFilter)) filter.role = roleFilter;
  const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit), 100);
  const lim  = Math.min(parseInt(limit), 100);
  const { users, total } = await userRepo.findUsersWithFilter(filter, skip, lim);
  return { page: parseInt(page), limit: lim, total, total_pages: Math.ceil(total / lim), users };
};

export const getUserById = async (userId) => {
  const user = await userRepo.findUserById(userId, '-password_hash -refresh_token');
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return user.toObject ? user.toObject() : user;
};

export const deleteUserAccount = async (userId) => {
  const user = await userRepo.deleteUserById(userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return user;
};
