import { z } from 'zod';

export const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

export const createReportSchema = z.object({
  file_url: z.string().url(),
  content_type: z.string().min(1).optional(),
  file_type: z.string().min(1).optional(),
  report_type: z.string().min(1),
  report_date: z.string().datetime().optional(),
});