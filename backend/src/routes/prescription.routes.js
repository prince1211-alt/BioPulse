import { validate } from '../middleware/validate.js';
import { prescriptionSchema, templateSchema } from '../schemas/prescription.schema.js';
import { Router } from 'express';
import {
  createPrescription,
  getPatientPrescriptions,
  getDoctorPrescriptions,
  getPrescriptionById,
  saveTemplate,
  getTemplates
} from '../controllers/prescription.controller.js';
import { authenticate, requireRole } from '../middleware/auth_middleware.js';

const router = Router();

router.use(authenticate);

router.post('/', requireRole('doctor'), validate(prescriptionSchema), createPrescription);
router.get('/patient', getPatientPrescriptions);
router.get('/doctor', requireRole('doctor'), getDoctorPrescriptions);
router.get('/templates', requireRole('doctor'), getTemplates);
router.post('/templates', requireRole('doctor'), validate(templateSchema), saveTemplate);
router.get('/:id', getPrescriptionById);

export default router;
