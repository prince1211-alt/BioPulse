import { User } from '../models/User.js';
import { success, error } from '../utils/response.js';

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password_hash -refresh_token');

    if (!user) {
      return error(res, 'NOT_FOUND', 'User not found', 404);
    }

    return success(res, user);

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch profile', 500);
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const data = req.body;

    // ✅ Allow only specific fields (VERY IMPORTANT)
    const allowedFields = [
      'name',
      'age',
      'gender',
      'height',
      'weight',
      'calorie_goal',
      'fcm_token'
    ];

    const updateData = {};

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    });

    // ❌ Prevent empty update
    if (Object.keys(updateData).length === 0) {
      return error(res, 'VALIDATION_ERROR', 'No valid fields provided', 400);
    }

    // ✅ Basic validation
    if (updateData.age && (updateData.age < 0 || updateData.age > 120)) {
      return error(res, 'VALIDATION_ERROR', 'Invalid age', 400);
    }

    if (updateData.weight && updateData.weight <= 0) {
      return error(res, 'VALIDATION_ERROR', 'Invalid weight', 400);
    }

    if (updateData.height && updateData.height <= 0) {
      return error(res, 'VALIDATION_ERROR', 'Invalid height', 400);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password_hash -refresh_token');

    if (!user) {
      return error(res, 'NOT_FOUND', 'User not found', 404);
    }

    return success(res, user);

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to update profile', 500);
  }
};