import { z } from 'zod';

export const bookAppointmentSchema = z.object({
  doctor_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  scheduled_at: z.string().datetime(),
  
  type: z.enum(['checkup', 'follow-up', 'consultation', 'lab']),
  notes: z.string().optional(),
});

export const autoBookSchema = z.object({
  doctor_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  window_days: z.number().int().positive().max(30).optional().default(7),
  trigger_medicine_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID').optional(),
});

export const rescheduleSchema = z.object({
  new_scheduled_at: z.string().datetime(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['completed', 'no_show']),
});

export const addScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be HH:mm'),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be HH:mm'),
  slot_duration: z.number().int().min(5, 'Duration must be at least 5 minutes').max(120),
  max_patients: z.number().int().min(1, 'At least 1 patient per slot required').default(1),
});

export const removeScheduleSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Schedule ID'),
});