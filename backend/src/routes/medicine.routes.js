import { Router } from 'express';
import { createMedicine, getMedicines, deleteMedicine, logDose, getTodaySchedule } from '../controllers/medicine.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createMedicineSchema, logDoseSchema } from '../schemas/medicine.schema.js';

const router = Router();

router.use(authenticate);
router.post('/', validate(createMedicineSchema), createMedicine);
router.get('/', getMedicines);
router.delete('/:id', deleteMedicine);
router.get('/today', getTodaySchedule);
router.post('/logs', validate(logDoseSchema), logDose);

export default router;
