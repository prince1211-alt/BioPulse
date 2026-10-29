import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(100),
  email: z.string().trim().email('Invalid email address').transform(v => v.toLowerCase()),
  password: z.string().min(6, 'Password must be at least 6 characters').refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes'),
  role: z.enum(['patient', 'doctor']).default('patient'),
  specialisation: z.string().trim().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').transform(v => v.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(6, 'New password must be at least 6 characters').refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes'),
});

export const updateFcmTokenSchema = z.object({
  fcm_token: z.string().min(1, 'Token is required'),
});
