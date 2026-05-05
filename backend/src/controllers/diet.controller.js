import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as dietService from '../services/diet.service.js';

export const getCurrentPlan = asyncHandler(async (req, res) => {
  const plan = await dietService.getCurrentDietPlan(req.userId);
  return success(res, plan);
});

export const getDietHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const history = await dietService.getDietHistory(req.userId, page, limit);
  return success(res, history);
});

export const generatePlan = asyncHandler(async (req, res) => {
  const plan = await dietService.generateDietPlan(req.userId);
  return success(res, plan, 'Diet plan generated', 201);
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await dietService.updateDietPlan(req.userId, req.params.id, req.body);
  return success(res, plan, 'Diet plan updated');
});

export const deletePlan = asyncHandler(async (req, res) => {
  await dietService.deleteDietPlan(req.userId, req.params.id);
  return success(res, { deleted: true }, 'Diet plan deleted');
});

export const searchFoods = asyncHandler(async (req, res) => {
  const foods = await dietService.searchDietFoods(req.query.q);
  return success(res, foods);
});

export const addCustomMeal = asyncHandler(async (req, res) => {
  const { meal_type, items } = req.body;
  const plan = await dietService.addCustomMealToPlan(req.userId, meal_type, items);
  return success(res, plan, 'Meal added');
});