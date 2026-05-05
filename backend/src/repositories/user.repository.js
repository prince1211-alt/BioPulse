import { User } from '../models/User.js';

export const findUserById = async (userId, selectFields = '-password_hash -refresh_token') => {
  return await User.findById(userId).select(selectFields);
};

export const updateUserById = async (userId, updateData, selectFields = '-password_hash -refresh_token') => {
  return await User.findByIdAndUpdate(userId, updateData, { new: true }).select(selectFields);
};

export const findDoctorById = async (doctorId) => {
  return await User.findOne({ _id: doctorId, role: 'doctor' })
    .select('name specialisation qualification experience_years bio consultation_fee clinic_address avatar_url');
};

export const findUsersWithFilter = async (filter, skip, limit, selectFields = '-password_hash -refresh_token') => {
  const users = await User.find(filter)
    .select(selectFields)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
    
  const total = await User.countDocuments(filter);
  
  return { users, total };
};

export const deleteUserById = async (userId) => {
  return await User.findByIdAndDelete(userId);
};
