import { z } from 'zod';

export const logMealSchema = z.object({
  diet_plan_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  day: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
  consumed: z.boolean(),
});

const item = z.object({
  _id: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  name: z.string().trim().min(1).max(200),
  calories: z.number().nonnegative().max(4000),
  macros: z.object({ protein: z.number().nonnegative().optional(), carbs: z.number().nonnegative().optional(), fat: z.number().nonnegative().optional() }).optional(),
  quantity: z.number().positive().optional(),
});
export const updatePlanSchema = z.object({
  meals: z.array(z.object({ day: z.string().max(30), restrictions: z.array(z.string()).nullable().optional(), meals: z.object({ breakfast: z.array(item), lunch: z.array(item), snack: z.array(item), dinner: z.array(item) }) })).min(1).max(7).optional(),
  total_calories: z.number().positive().max(4000).optional(),
  goal: z.enum(['maintenance', 'weight_loss', 'weight_gain']).optional(),
  notes: z.string().max(5000).optional(),
}).refine(data => Object.keys(data).length > 0, 'At least one field must be provided');
export const addCustomMealSchema = z.object({ meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']), items: z.array(item).min(1).max(50) });
