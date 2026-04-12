import { Router } from 'express';
import { getUploadUrl, createReport, getReports, getReportById, getReportStatus, reanalyzeReport, deleteReport, getTrends, getPatientReports } from '../controllers/report.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { uploadUrlSchema, createReportSchema } from '../schemas/report.schema.js';

const router = Router();

router.use(authenticate);

router.post('/upload-url', validate(uploadUrlSchema), getUploadUrl);
router.post('/', validate(createReportSchema), createReport);
router.get('/', getReports);
router.get('/trends/:biomarker', getTrends);
router.get('/patient/:patientId', getPatientReports);
router.get('/:id', getReportById);
router.get('/:id/status', getReportStatus);
router.post('/:id/reanalyze', reanalyzeReport);
router.delete('/:id', deleteReport);

export default router;
