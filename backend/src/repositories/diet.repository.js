import { DietPlan } from '../models/DietPlan.js';

export const findActiveDietPlan = async (userId) => {
  return await DietPlan.findOne({ user_id: userId, is_active: true })
    .sort({ createdAt: -1 })
    .lean();
};

export const findDietHistory = async (userId, skip, limit) => {
  const [plans, total] = await Promise.all([
    DietPlan.find({ user_id: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    DietPlan.countDocuments({ user_id: userId }),
  ]);
  return { plans, total };
};

export const findActiveDietPlanForUpdate = async (userId) => {
  return await DietPlan.findOne({ user_id: userId, is_active: true });
};

export const findDietPlanByIdAndUser = async (planId, userId) => {
  return await DietPlan.findOne({ _id: planId, user_id: userId });
};

export const deactivateAllPlans = async (userId) => {
  await DietPlan.updateMany({ user_id: userId, is_active: true }, { $set: { is_active: false } });
};

export const createDietPlan = async (data) => {
  return await DietPlan.create(data);
};
