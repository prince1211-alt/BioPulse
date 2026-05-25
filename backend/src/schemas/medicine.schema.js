import { z } from 'zod';

const dateOrDatetime = z.string().refine(
  (v) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v),
  { message: 'Expected date (YYYY-MM-DD) or ISO datetime' }
);

export const createMedicineSchema = z.object({
  name:             z.string().min(1, 'Name is required'),
  
  dosage:           z.union([z.number().positive(), z.string().min(1)]),
  unit:             z.string().optional(),
  frequency:        z.enum(['daily', 'weekly', 'custom']).optional(),
  times:            z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format HH:MM')).min(1),
  food_instruction: z.enum(['before', 'after', 'with']).optional(),
  start_date:       dateOrDatetime.optional(),
  end_date:         dateOrDatetime.optional(),
  days_supply:      z.number().int().positive().optional(),
  notes:            z.string().optional(),
});

export const updateMedicineSchema = createMedicineSchema.partial();

export const logDoseSchema = z.object({
  medicine_id:  z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  scheduled_at: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
  status:       z.enum(['taken', 'missed', 'skipped', 'snoozed']),
  notes:        z.string().optional(),
});
