import { Router } from 'express';
import { createMedicine, getMedicines, getMedicineById, updateMedicine, deleteMedicine, logDose, getTodaySchedule, getAdherenceStats } from '../controllers/medicine.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { createMedicineSchema, logDoseSchema, updateMedicineSchema } from '../schemas/medicine.schema.js';

const router = Router();

router.use(authenticate);
router.post('/', validate(createMedicineSchema), createMedicine);
router.get('/', getMedicines);
router.get('/schedule/today', getTodaySchedule);
router.get('/adherence', getAdherenceStats);
router.post('/log', validate(logDoseSchema), logDose);
router.get('/:id', getMedicineById);
router.patch('/:id', validate(updateMedicineSchema), updateMedicine);
router.delete('/:id', deleteMedicine);

export default router;
