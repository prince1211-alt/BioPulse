import { Router } from 'express';
import { getDoctors, getDoctorSchedules, addSchedule, removeSchedule, getAppointments, bookAppointment, rescheduleAppointment, autoBook, cancelAppointment, updateAppointmentStatus, updateQueueStatus, getDoctorQueue } from '../controllers/appointment.controller.js';
import { authenticate, requireRole } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { bookAppointmentSchema, autoBookSchema, addScheduleSchema, removeScheduleSchema, rescheduleSchema, updateStatusSchema } from '../schemas/appointment.schema.js';

const router = Router();

router.use(authenticate);

router.get('/doctors', getDoctors);
router.post('/doctors/schedules', requireRole('doctor'), validate(addScheduleSchema), addSchedule);
router.delete('/doctors/schedules', requireRole('doctor'), validate(removeScheduleSchema), removeSchedule);
router.get('/doctors/:id/schedules', getDoctorSchedules);
router.get('/doctors/:id/queue', getDoctorQueue);

router.get('/', getAppointments);
router.post('/', requireRole('patient'), validate(bookAppointmentSchema), bookAppointment);
router.post('/auto-book', requireRole('patient'), validate(autoBookSchema), autoBook);

router.patch('/:id/reschedule', requireRole('patient'), validate(rescheduleSchema), rescheduleAppointment);
router.patch('/:id/status', requireRole('doctor'), validate(updateStatusSchema), updateAppointmentStatus);
router.patch('/:id/queue-status', requireRole('doctor'), updateQueueStatus);
router.delete('/:id', cancelAppointment);

export default router;
