import { z } from 'zod';

const VALID_REPORT_TYPES = ['blood_test', 'lipid_panel', 'diabetes', 'thyroid', 'urine', 'xray', 'mri', 'other'];

// Used for multipart/form-data upload validation (req.body fields from multer)
export const uploadReportSchema = z.object({
  report_type: z.enum(VALID_REPORT_TYPES, {
    errorMap: () => ({ message: `report_type must be one of: ${VALID_REPORT_TYPES.join(', ')}` }),
  }),
  report_date: z.string().optional(),
});