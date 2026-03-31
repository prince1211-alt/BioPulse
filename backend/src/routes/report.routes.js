import { Router } from 'express';
import { getUploadUrl, createReport, getReports, getReportById, reanalyzeReport, getTrends } from '../controllers/report.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadUrlSchema, createReportSchema } from '../schemas/report.schema.js';

const router = Router();

router.use(authenticate);

router.post('/upload-url', validate(uploadUrlSchema), getUploadUrl);
router.post('/', validate(createReportSchema), createReport);
router.get('/', getReports);
router.get('/:id', getReportById);
router.post('/:id/analyse', reanalyzeReport);
router.get('/trends/:biomarker', getTrends);

export default router;
