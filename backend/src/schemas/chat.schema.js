import { z } from 'zod';
export const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(20).default([]),
  patient_type: z.enum(['general', 'diabetic', 'hypertensive', 'renal']).optional(),
});
