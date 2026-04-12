import { Router } from 'express';
import { getDoctors, getDoctorSlots, addSlots, removeSlot, getAppointments, bookAppointment, rescheduleAppointment, autoBook, cancelAppointment, updateAppointmentStatus } from '../controllers/appointment.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { bookAppointmentSchema, autoBookSchema } from '../schemas/appointment.schema.js';

const router = Router();

router.use(authenticate);

router.get('/doctors', getDoctors);
router.post('/doctors/slots', addSlots);
router.delete('/doctors/slots', removeSlot);
router.get('/doctors/:id/slots', getDoctorSlots);

router.get('/', getAppointments);
router.post('/', validate(bookAppointmentSchema), bookAppointment);
router.post('/auto-book', validate(autoBookSchema), autoBook);

router.patch('/:id/reschedule', rescheduleAppointment);
router.patch('/:id/status', updateAppointmentStatus);
router.delete('/:id', cancelAppointment);

export default router;
