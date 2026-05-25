import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as userService from '../services/user.service.js';

export const getProfile = asyncHandler(async (req, res) => {
  const user = await userService.getUserProfile(req.userId);
  return success(res, user);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateUserProfile(req.userId, req.userRole, req.body);
  return success(res, user, 'Profile updated');
});

export const getDoctorProfile = asyncHandler(async (req, res) => {
  const doctor = await userService.getDoctorProfile(req.params.doctorId);
  return success(res, doctor);
});

export const getAllUsers = asyncHandler(async (req, res) => {
  const { role, page, limit } = req.query;
  const result = await userService.getAllUsers(role, page, limit);
  return success(res, result);
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  return success(res, user);
});

export const deleteAccount = asyncHandler(async (req, res) => {
  await userService.deleteUserAccount(req.userId);
  res.clearCookie('refreshToken');
  return success(res, { deleted: true }, 'Account deleted');
});

export const getPatientHistory = asyncHandler(async (req, res) => {
  const history = await userService.getPatientHistory(req.params.userId);
  return success(res, history);
});
