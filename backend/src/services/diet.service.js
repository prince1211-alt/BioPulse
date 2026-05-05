import { User } from '../models/User.js';
import { calculateBMR, calculateCalories, generateMeals } from '../utils/healthUtils.js';
import { searchFoodsFromAPI } from '../utils/searchFoodsFromAPI.js';
import { AppError } from '../utils/AppError.js';
import * as dietRepo from '../repositories/diet.repository.js';

export const getCurrentDietPlan = async (userId) => {
  return await dietRepo.findActiveDietPlan(userId) || null;
};

export const getDietHistory = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const { plans, total } = await dietRepo.findDietHistory(userId, skip, limit);
  return { page, limit, total, total_pages: Math.ceil(total / limit), plans };
};

export const generateDietPlan = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const { weight, height, age } = user;
  if (!weight || !height || !age) {
    throw new AppError('Profile must have weight, height, and age set', 400, 'INVALID_INPUT');
  }

  const bmr      = calculateBMR(user);
  const goal     = user.goal || 'maintenance';
  const calories = calculateCalories(bmr, goal);
  const meals    = generateMeals(calories, {
    conditions: user.chronic_conditions || user.conditions || [],
    allergies:  user.allergies || [],
    goal,
  });

  await dietRepo.deactivateAllPlans(userId);

  return await dietRepo.createDietPlan({
    user_id:        user._id,
    week_start:     new Date(),
    meals,
    total_calories: calories,
    goal,
    bmr,
    ai_generated:   false,
    is_active:      true,
  });
};

export const updateDietPlan = async (userId, planId, data) => {
  const plan = await dietRepo.findActiveDietPlanForUpdate(userId);
  if (!plan || plan._id.toString() !== planId) {
    throw new AppError('Active diet plan not found', 404, 'NOT_FOUND');
  }
  const ALLOWED = ['meals', 'total_calories', 'goal', 'notes'];
  ALLOWED.forEach((field) => { if (data[field] !== undefined) plan[field] = data[field]; });
  await plan.save();
  return plan;
};

export const deleteDietPlan = async (userId, planId) => {
  const plan = await dietRepo.findDietPlanByIdAndUser(planId, userId);
  if (!plan) throw new AppError('Diet plan not found', 404, 'NOT_FOUND');
  await plan.deleteOne();
  return { deleted: true };
};

export const searchDietFoods = async (query) => {
  if (!query || query.trim().length < 2) return [];
  try {
    return await searchFoodsFromAPI(query.trim());
  } catch (err) {
    if (err.message === 'FOOD_API_ERROR') throw new AppError('Food API failed', 502, 'EXTERNAL_API_ERROR');
    throw new AppError('Food search failed', 500, 'SERVER_ERROR');
  }
};

export const addCustomMealToPlan = async (userId, meal_type, items) => {
  const plan = await dietRepo.findActiveDietPlanForUpdate(userId);
  if (!plan) throw new AppError('No active diet plan found. Generate one first.', 404, 'NOT_FOUND');
  if (!Array.isArray(plan.meals) || plan.meals.length === 0) {
    throw new AppError('Diet plan has no meal days configured', 400, 'INVALID_STATE');
  }

  const todayPlan = plan.meals[0];
  if (!todayPlan.meals) todayPlan.meals = {};
  if (!todayPlan.meals[meal_type]) {
    todayPlan.meals[meal_type] = { name: '', calories: 0, macros: { protein: 0, carbs: 0, fat: 0 } };
  }

  const existingMeal  = todayPlan.meals[meal_type];
  const addedNames    = items.map((i) => i.name).filter(Boolean).join(', ');
  const addedCal      = items.reduce((sum, i) => sum + (Number(i.calories)        || 0), 0);
  const addedProtein  = items.reduce((sum, i) => sum + (Number(i.macros?.protein) || 0), 0);
  const addedCarbs    = items.reduce((sum, i) => sum + (Number(i.macros?.carbs)   || 0), 0);
  const addedFat      = items.reduce((sum, i) => sum + (Number(i.macros?.fat)     || 0), 0);

  existingMeal.name             = existingMeal.name ? `${existingMeal.name} + ${addedNames}` : addedNames;
  existingMeal.calories         = (existingMeal.calories || 0) + addedCal;
  if (!existingMeal.macros) existingMeal.macros = { protein: 0, carbs: 0, fat: 0 };
  existingMeal.macros.protein   = (existingMeal.macros.protein || 0) + addedProtein;
  existingMeal.macros.carbs     = (existingMeal.macros.carbs   || 0) + addedCarbs;
  existingMeal.macros.fat       = (existingMeal.macros.fat     || 0) + addedFat;

  plan.markModified('meals');
  await plan.save();
  return plan;
};
