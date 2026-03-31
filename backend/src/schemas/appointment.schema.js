import { z } from 'zod';

export const bookAppointmentSchema = z.object({
  doctor_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  scheduled_at: z.string().datetime(),
  type: z.enum(['checkup', 'follow-up', 'lab']),
});

export const autoBookSchema = z.object({
  doctor_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  window_days: z.number().int().positive().max(30),
  trigger_medicine_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID').optional(),
});
