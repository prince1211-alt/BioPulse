import { Router } from 'express';
import { getDoctors, getDoctorSlots, getAppointments, bookAppointment, autoBook, cancelAppointment } from '../controllers/appointment.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bookAppointmentSchema, autoBookSchema } from '../schemas/appointment.schema.js';

const router = Router();

router.use(authenticate);

router.get('/doctors', getDoctors);
router.get('/doctors/:id/slots', getDoctorSlots);

router.get('/', getAppointments);
router.post('/', validate(bookAppointmentSchema), bookAppointment);
router.post('/auto-book', validate(autoBookSchema), autoBook);
router.delete('/:id', cancelAppointment);

export default router;
