import { z } from 'zod';

export const logMealSchema = z.object({
  diet_plan_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  day: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
  consumed: z.boolean(),
});

export const updatePlanSchema = z.object({
  meals: z.array(z.any()).optional(),
  total_calories: z.number().optional(),
  goal: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const addCustomMealSchema = z.object({
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(z.object({
    name: z.string(),
    calories: z.number(),
    macros: z.object({
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
    }).optional(),
  })).min(1, 'items array cannot be empty'),
});
