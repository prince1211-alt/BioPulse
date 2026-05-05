import { Router } from 'express';
import { uploadReport, getReports, getReportById, getReportStatus, reanalyzeReport, deleteReport, getTrends, getPatientReports } from '../controllers/report.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../utils/cloudinary.js';
import { uploadReportSchema } from '../schemas/report.schema.js';

const router = Router();

router.use(authenticate);

router.post('/upload', upload.single('file'), validate(uploadReportSchema), uploadReport);
router.get('/', getReports);
router.get('/trends/:biomarker', getTrends);
router.get('/patient/:patientId', getPatientReports);
router.get('/:id', getReportById);
router.get('/:id/status', getReportStatus);
router.post('/:id/reanalyze', reanalyzeReport);
router.delete('/:id', deleteReport);

export default router;
