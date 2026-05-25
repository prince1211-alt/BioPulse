import { Router } from 'express';
import { getDoctors, getDoctorSchedules, addSchedule, removeSchedule, getAppointments, bookAppointment, rescheduleAppointment, autoBook, cancelAppointment, updateAppointmentStatus, updateQueueStatus, getDoctorQueue } from '../controllers/appointment.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { bookAppointmentSchema, autoBookSchema, addScheduleSchema, removeScheduleSchema, rescheduleSchema, updateStatusSchema } from '../schemas/appointment.schema.js';

const router = Router();

router.use(authenticate);

router.get('/doctors', getDoctors);
router.post('/doctors/schedules', validate(addScheduleSchema), addSchedule);
router.delete('/doctors/schedules', validate(removeScheduleSchema), removeSchedule);
router.get('/doctors/:id/schedules', getDoctorSchedules);
router.get('/doctors/:id/queue', getDoctorQueue);

router.get('/', getAppointments);
router.post('/', validate(bookAppointmentSchema), bookAppointment);
router.post('/auto-book', validate(autoBookSchema), autoBook);

router.patch('/:id/reschedule', validate(rescheduleSchema), rescheduleAppointment);
router.patch('/:id/status', validate(updateStatusSchema), updateAppointmentStatus);
router.patch('/:id/queue-status', updateQueueStatus);
router.delete('/:id', cancelAppointment);

export default router;
