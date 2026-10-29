import { z } from 'zod';
import { requirePatientAccess } from '../middleware/patientAccess.js';
import { Router } from 'express';
import { getProfile, updateProfile, getDoctorProfile, getAllUsers, getUserById, deleteAccount, getPatientHistory } from '../controllers/user.controller.js';
import { banUser } from '../controllers/auth.controller.js';
import { authenticate, requireRole } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../schemas/user.schema.js';

const router = Router();

router.use(authenticate);

router.get('/doctors/:doctorId', getDoctorProfile);

router.get('/me', getProfile);
router.patch('/me', validate(updateProfileSchema), updateProfile);
router.delete('/me', deleteAccount);

router.get('/', requireRole('admin'), getAllUsers);
router.get('/:userId', requireRole('admin'), getUserById);
router.get('/:userId/history', requirePatientAccess('userId'), getPatientHistory);
router.patch('/:userId/ban', requireRole('admin'), validate(z.object({ ban: z.boolean() })), banUser);

export default router;
