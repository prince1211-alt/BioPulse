import { Router } from 'express';
import {
  createPrescription,
  getPatientPrescriptions,
  getDoctorPrescriptions,
  getPrescriptionById,
  saveTemplate,
  getTemplates
} from '../controllers/prescription.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.use(authenticate);

router.post('/', createPrescription);
router.get('/patient', getPatientPrescriptions);
router.get('/doctor', getDoctorPrescriptions);
router.get('/templates', getTemplates);
router.post('/templates', saveTemplate);
router.get('/:id', getPrescriptionById);

export default router;
