import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as dietService from '../services/diet.service.js';

export const getCurrentPlan = asyncHandler(async (req, res) => {
  const plan = await dietService.getCurrentDietPlan(req.userId);
  return success(res, plan);
});

export const getDietHistory = asyncHandler(async (req, res) => {
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 10;
  const history = await dietService.getDietHistory(req.userId, page, limit);
  return success(res, history);
});

export const getDietRecommendations = asyncHandler(async (req, res) => {
  const recommendations = await dietService.getDietRecommendations(req.userId);
  return success(res, recommendations);
});

export const generatePlan = asyncHandler(async (req, res) => {
  const patientType = req.body?.patient_type || null;
  const plan = await dietService.generateDietPlan(req.userId, patientType);
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

export const removeCustomMeal = asyncHandler(async (req, res) => {
  const { meal_type, itemId } = req.params;
  const plan = await dietService.removeCustomMealFromPlan(req.userId, meal_type, itemId);
  return success(res, plan, 'Meal removed');
});

export const chatDietAssistant = asyncHandler(async (req, res) => {
  const { message, patient_type, history } = req.body;
  if (!message) {
    return res.status(400).json({ status: 'error', message: 'Message is required' });
  }
  const response = await dietService.chatDietAssistant(req.userId, message, patient_type, history);
  return success(res, response, 'Chat response generated');
});