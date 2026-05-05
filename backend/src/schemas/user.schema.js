import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  age: z.number().min(0).max(120).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  height: z.number().positive('Height must be positive').optional(),
  weight: z.number().positive('Weight must be positive').optional(),
  calorie_goal: z.number().positive().optional(),
  fcm_token: z.string().optional(),
  avatar_url: z.string().url().optional().or(z.literal('')),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.array(z.string()).optional(),
  chronic_conditions: z.array(z.string()).optional(),
  emergency_contact: z.string().optional(),

  // Doctor specific
  specialisation: z.string().optional(),
  qualification: z.string().optional(),
  experience_years: z.number().min(0).optional(),
  bio: z.string().optional(),
  consultation_fee: z.number().min(0).optional(),
  clinic_address: z.string().optional(),
  phone: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});
