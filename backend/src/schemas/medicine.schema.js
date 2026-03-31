import { z } from 'zod';

export const createMedicineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  dosage: z.number().positive(),
  unit: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'custom']),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Invalid time format HH:MM')),
  food_instruction: z.enum(['before', 'after', 'with']).optional(),
  start_date: z.string().datetime(),
  end_date: z.string().datetime().optional(),
  days_supply: z.number().int().positive().optional(),
});

export const updateMedicineSchema = createMedicineSchema.partial();

export const logDoseSchema = z.object({
  medicine_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  scheduled_at: z.string().datetime(),
  status: z.enum(['taken', 'skipped', 'snoozed']),
  notes: z.string().optional(),
});
