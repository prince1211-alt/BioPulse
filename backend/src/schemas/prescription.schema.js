import { z } from 'zod';

const id = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');
const fields = {
  diagnosis: z.string().trim().min(1).max(5000),
  symptoms: z.array(z.string().max(500)).max(50).default([]),
  medicines: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    dosage: z.string().trim().min(1).max(100),
    frequency: z.string().trim().min(1).max(100),
    duration: z.string().trim().min(1).max(100),
    instructions: z.string().max(1000).default(''),
  })).max(50),
  advice: z.string().max(10000).default(''),
};
export const prescriptionSchema = z.object({ ...fields, patient_id: id, appointment_id: id });
export const templateSchema = z.object({ ...fields, template_name: z.string().trim().min(1).max(100) });
