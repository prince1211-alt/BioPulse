import axios from 'axios';
import { User } from '../models/User.js';
import { calculateBMR, calculateCalories, generateMeals } from '../utils/healthUtils.js';
import { searchFoodsFromAPI } from '../utils/searchFoodsFromAPI.js';
import { AppError } from '../utils/AppError.js';
import * as dietRepo from '../repositories/diet.repository.js';
import {
  normalizePatientType,
  buildAutoRecommendations,
  getPatientDietWarnings,
} from '../utils/patientDietRules.js';

const enrichPlanForResponse = (plan, patientType) => {
  if (!plan) return null;
  const plainPlan = typeof plan.toObject === 'function' ? plan.toObject() : { ...plan };
  return {
    ...plainPlan,
    patient_type:        patientType,
    auto_recommendations: buildAutoRecommendations(patientType),
  };
};

export const getCurrentDietPlan = async (userId) => {
  const [plan, user] = await Promise.all([
    dietRepo.findActiveDietPlan(userId),
    User.findById(userId).lean(),
  ]);
  if (!plan) return null;
  const patientType = normalizePatientType(user);
  return enrichPlanForResponse(plan, patientType);
};

export const getDietHistory = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const { plans, total } = await dietRepo.findDietHistory(userId, skip, limit);
  return { page, limit, total, total_pages: Math.ceil(total / limit), plans };
};

export const getDietRecommendations = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const patientType = normalizePatientType(user);
  return {
    patient_type:    patientType,
    recommendations: buildAutoRecommendations(patientType),
  };
};

export const generateDietPlan = async (userId, overridePatientType) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const { weight, height, age } = user;
  if (!weight || !height || !age) {
    throw new AppError('Profile must have weight, height, and age set', 400, 'INVALID_INPUT');
  }

  const patientType = overridePatientType || normalizePatientType(user);
  const bmr         = calculateBMR(user);
  const goal        = user.goal || 'maintenance';
  const calories    = calculateCalories(bmr, goal);
  const meals       = generateMeals(calories, {
    conditions: user.chronic_conditions || user.conditions || [],
    allergies:  user.allergies || [],
    goal,
    patientType,
  });

  await dietRepo.deactivateAllPlans(userId);

  const plan = await dietRepo.createDietPlan({
    user_id:        user._id,
    week_start:     new Date(),
    meals,
    total_calories: calories,
    goal,
    bmr,
    patient_type:   patientType,
    ai_generated:   true,
    is_active:      true,
  });

  return enrichPlanForResponse(plan, patientType);
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
  let [plan, user] = await Promise.all([
    dietRepo.findActiveDietPlanForUpdate(userId),
    User.findById(userId).lean(),
  ]);

  const patientType = normalizePatientType(user);

  if (!plan) {
    let bmr = 1500; 
    try {
      bmr = calculateBMR(user);
    } catch (err) {
      console.warn('Could not calculate BMR for user, using default. Missing profile data.');
    }
    const goal        = user?.goal || 'maintenance';
    const calories    = calculateCalories(bmr, goal);

    plan = await dietRepo.createDietPlan({
      user_id:        user._id,
      week_start:     new Date(),
      meals:          [{ day: 'Today', meals: {} }],
      total_calories: calories,
      goal,
      bmr,
      patient_type:   patientType,
      ai_generated:   false,
      is_active:      true,
    });
  }

  if (!Array.isArray(plan.meals) || plan.meals.length === 0) {
    plan.meals = [{ day: 'Today', meals: {} }];
  }

  const todayPlan = plan.meals[0];
  if (!todayPlan.meals) todayPlan.meals = {};
  if (!todayPlan.meals[meal_type] || !Array.isArray(todayPlan.meals[meal_type])) {
    todayPlan.meals[meal_type] = [];
  }

  const validatedItems = items.map(item => {
    let p = Number(item.macros?.protein) || 0;
    let c = Number(item.macros?.carbs) || 0;
    let f = Number(item.macros?.fat) || 0;
    let inputCal = Number(item.calories) || 0;
    
    if (p < 0 || c < 0 || f < 0 || inputCal < 0) {
      throw new AppError('Nutritional values cannot be negative', 400);
    }

    if (p === 0 && c === 0 && f === 0 && inputCal > 0) {
      p = Math.round((inputCal * 0.25) / 4);
      c = Math.round((inputCal * 0.50) / 4);
      f = Math.round((inputCal * 0.25) / 9);
    }

    const calcCal = (p * 4) + (c * 4) + (f * 9);

    const finalCal = calcCal > 0 ? calcCal : inputCal;

    return { ...item, calories: finalCal, macros: { protein: p, carbs: c, fat: f } };
  });

  const addedCal = validatedItems.reduce((sum, i) => sum + i.calories, 0);

  let currentDailyTotal = 0;
  for (const mType of ['breakfast', 'lunch', 'snack', 'dinner']) {
    const mealItems = todayPlan.meals[mType] || [];
    for (const item of mealItems) {
      currentDailyTotal += item.calories || 0;
    }
  }
  
  console.log(`[DEBUG] currentDailyTotal=${currentDailyTotal}, addedCal=${addedCal}, meal_type=${meal_type}`);
  console.log(`[DEBUG] todayPlan.meals=${JSON.stringify(todayPlan.meals)}`);

  if (currentDailyTotal + addedCal > 4000) {
    throw new AppError('Daily intake would exceed the safe limit of 4000 kcal. Please verify your entries.', 400);
  }

  validatedItems.forEach(i => {
    todayPlan.meals[meal_type].push(i);
  });

  const warnings = getPatientDietWarnings(patientType, validatedItems);
  
  const mealTotal = todayPlan.meals[meal_type].reduce((sum, i) => sum + i.calories, 0);
  if (mealTotal > 2000) {
    warnings.push(`${meal_type.toUpperCase()} exceeds 2000 kcal. Consider splitting this into smaller portions.`);
  }

  plan.markModified('meals');
  await plan.save();

  const responsePlan = enrichPlanForResponse(plan, patientType);
  if (warnings.length) responsePlan.manual_warnings = warnings;
  return responsePlan;
};

export const removeCustomMealFromPlan = async (userId, meal_type, itemId) => {
  const plan = await dietRepo.findActiveDietPlanForUpdate(userId);
  if (!plan) throw new AppError('Active diet plan not found', 404, 'NOT_FOUND');

  const todayPlan = plan.meals[0];
  if (!todayPlan || !todayPlan.meals || !todayPlan.meals[meal_type] || !Array.isArray(todayPlan.meals[meal_type])) {
    throw new AppError('Meal type not found', 404, 'NOT_FOUND');
  }

  const mealArray = todayPlan.meals[meal_type];
  const itemIndex = mealArray.findIndex(item => item._id.toString() === itemId);

  if (itemIndex === -1) {
    throw new AppError('Food item not found', 404, 'NOT_FOUND');
  }

  mealArray.splice(itemIndex, 1);
  plan.markModified('meals');
  await plan.save();

  const user = await User.findById(userId).lean();
  const patientType = normalizePatientType(user);
  return enrichPlanForResponse(plan, patientType);
};

export const chatDietAssistant = async (userId, message, patientType, history) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const finalPatientType = patientType || normalizePatientType(user);

  const systemPrompt = `You are a clinical dietitian AI assistant for the BioPulse app.
Your goal is to provide concise, practical, and empathetic dietary recommendations.
The current patient is classified as: ${finalPatientType.toUpperCase()}.
Always tailor your advice to this patient type. 
Do not provide medical diagnosis, but rather focus on food choices, meal ideas, and general dietary guidelines suitable for this condition.
Keep your responses relatively brief (2-4 short paragraphs maximum) and easy to read. You can use markdown (like bolding or bullet points) to format your response.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || []).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.5,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const reply = response.data.choices[0].message.content.trim();
    return { reply };
  } catch (err) {
    console.error('Diet Chatbot error:', err.response?.data || err.message);
    throw new AppError('AI Chatbot failed to generate a response', 500, 'SERVER_ERROR');
  }
};
