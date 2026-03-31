import { z } from 'zod';

export const logMealSchema = z.object({
  diet_plan_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  day: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
  consumed: z.boolean(),
});
