import { DietPlan } from '../models/DietPlan.js';
import { User } from '../models/User.js';
import { success, error } from '../utils/response.js';
import {
  calculateBMR,
  calculateCalories,
  generateMeals
} from '../utils/healthUtils.js';
import { searchFoodsFromAPI } from '../utils/searchFoodsFromAPI.js';  

// =========================
// 🔹 GET CURRENT PLAN
// =========================
export const getCurrentPlan = async (req, res) => {
  try {
    const plan = await DietPlan.findOne({
      user_id: req.userId,
      is_active: true
    }).sort({ createdAt: -1 }).lean();

    return success(res, plan || null);

  } catch (err) {
    console.error('Get Plan Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to load diet plan', 500);
  }
};

// =========================
// 🔹 GENERATE PLAN
// =========================
export const generatePlan = async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();

    if (!user) {
      return error(res, 'NOT_FOUND', 'User not found', 404);
    }

    // Validate required fields
    const { weight, height, age } = user;
    if (!weight || !height || !age) {
      return error(res, 'INVALID_INPUT', 'Missing health data', 400);
    }

    // Step 1: BMR
    const bmr = calculateBMR(user);

    // Step 2: Calories
    const goal = user.goal || 'maintenance';
    const calories = calculateCalories(bmr, goal);

    // Step 3: Meals
    const meals = generateMeals(calories);

    // Step 4: Transaction (important in production)
    await DietPlan.updateMany(
      { user_id: user._id, is_active: true },
      { $set: { is_active: false } }
    );

    const plan = await DietPlan.create({
      user_id: user._id,
      week_start: new Date(),
      meals,
      total_calories: calories,
      goal,
      bmr,
      ai_generated: true
    });

    return success(res, plan, 'Diet plan generated', 201);

  } catch (err) {
    console.error('Generate Plan Error:', err);

    if (err.message === 'INVALID_USER_DATA') {
      return error(res, 'INVALID_INPUT', 'Invalid user data', 400);
    }

    return error(res, 'SERVER_ERROR', 'Failed to generate plan', 500);
  }
};

// =========================
// 🔹 FOOD SEARCH (REAL API)
// =========================
export const searchFoods = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return success(res, []);
    }

    const foods = await searchFoodsFromAPI(q.trim());

    return success(res, foods);

  } catch (err) {
    console.error('Food Search Error:', err);

    if (err.message === 'FOOD_API_ERROR') {
      return error(res, 'EXTERNAL_API_ERROR', 'Food API failed', 502);
    }

    return error(res, 'SERVER_ERROR', 'Food search failed', 500);
  }
};