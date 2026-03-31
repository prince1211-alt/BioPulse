import { z } from 'zod';

export const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

export const createReportSchema = z.object({
  file_url: z.string().url(),
  file_type: z.string().min(1),
  report_type: z.string().min(1),
  report_date: z.string().datetime().optional(),
});
