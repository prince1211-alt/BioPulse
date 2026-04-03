import { DietPlan } from '../models/DietPlan.js';
import { User } from '../models/User.js';
import { success, error } from '../utils/response.js';
import { calculateBMR, calculateCalories, generateMeals } from '../utils/healthUtils.js';
import { searchFoodsFromAPI } from '../utils/searchFoodsFromAPI.js';

// ─── GET CURRENT PLAN ─────────────────────────────────────────────────────────

export const getCurrentPlan = async (req, res) => {
  try {
    const plan = await DietPlan.findOne({
      user_id:   req.userId,
      is_active: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, plan || null);
  } catch (err) {
    console.error('Get Plan Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to load diet plan', 500);
  }
};

// ─── GET ALL PLANS (history) ──────────────────────────────────────────────────

export const getDietHistory = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip  = (page - 1) * limit;

    const [plans, total] = await Promise.all([
      DietPlan.find({ user_id: req.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DietPlan.countDocuments({ user_id: req.userId }),
    ]);

    return success(res, {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      plans,
    });
  } catch (err) {
    console.error('Diet History Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to load diet history', 500);
  }
};

// ─── GENERATE PLAN ────────────────────────────────────────────────────────────

export const generatePlan = async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();

    if (!user) return error(res, 'NOT_FOUND', 'User not found', 404);

    const { weight, height, age } = user;
    if (!weight || !height || !age) {
      return error(res, 'INVALID_INPUT', 'Profile must have weight, height, and age set', 400);
    }

    const bmr      = calculateBMR(user);
    const goal     = user.goal || 'maintenance';
    const calories = calculateCalories(bmr, goal);
    const meals    = generateMeals(calories, {
      conditions:  user.chronic_conditions || [],
      allergies:   user.allergies || [],
      goal,
    });

    // Deactivate previous plans
    await DietPlan.updateMany(
      { user_id: user._id, is_active: true },
      { $set: { is_active: false } }
    );

    const plan = await DietPlan.create({
      user_id:         user._id,
      week_start:      new Date(),
      meals,
      total_calories:  calories,
      goal,
      bmr,
      ai_generated:    false,
      is_active:       true,
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

// ─── UPDATE PLAN (manual edits) ───────────────────────────────────────────────

export const updatePlan = async (req, res) => {
  try {
    const plan = await DietPlan.findOne({
      _id:       req.params.id,
      user_id:   req.userId,
      is_active: true,
    });

    if (!plan) return error(res, 'NOT_FOUND', 'Active diet plan not found', 404);

    const ALLOWED = ['meals', 'total_calories', 'goal', 'notes'];
    ALLOWED.forEach((field) => {
      if (req.body[field] !== undefined) plan[field] = req.body[field];
    });

    await plan.save();

    return success(res, plan, 'Diet plan updated');
  } catch (err) {
    console.error('Update Plan Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to update plan', 500);
  }
};

// ─── DELETE PLAN ──────────────────────────────────────────────────────────────

export const deletePlan = async (req, res) => {
  try {
    const plan = await DietPlan.findOne({ _id: req.params.id, user_id: req.userId });

    if (!plan) return error(res, 'NOT_FOUND', 'Diet plan not found', 404);

    await plan.deleteOne();

    return success(res, { deleted: true }, 'Diet plan deleted');
  } catch (err) {
    console.error('Delete Plan Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to delete plan', 500);
  }
};

// ─── FOOD SEARCH ──────────────────────────────────────────────────────────────

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

// ─── ADD CUSTOM MEAL ──────────────────────────────────────────────────────────

export const addCustomMeal = async (req, res) => {
  try {
    const { meal_type, items } = req.body; // e.g. meal_type: 'lunch', items: [{ name, calories, ... }]

    const VALID_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!meal_type || !VALID_TYPES.includes(meal_type)) {
      return error(res, 'VALIDATION_ERROR', `meal_type must be one of: ${VALID_TYPES.join(', ')}`, 400);
    }
    if (!Array.isArray(items) || items.length === 0) {
      return error(res, 'VALIDATION_ERROR', 'items array is required', 400);
    }

    const plan = await DietPlan.findOne({ user_id: req.userId, is_active: true });
    if (!plan) {
      return error(res, 'NOT_FOUND', 'No active diet plan found. Generate one first.', 404);
    }

    if (!plan.meals) plan.meals = {};
    if (!Array.isArray(plan.meals[meal_type])) plan.meals[meal_type] = [];
    plan.meals[meal_type].push(...items);
    plan.markModified('meals');
    await plan.save();

    return success(res, plan, 'Meal added');
  } catch (err) {
    console.error('Add Meal Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to add meal', 500);
  }
};
