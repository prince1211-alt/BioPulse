import { Router } from 'express';
import { getProfile, updateProfile, getDoctorProfile, getAllUsers, getUserById, deleteAccount } from '../controllers/user.controller.js';
import { banUser } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../schemas/user.schema.js';

const router = Router();

router.use(authenticate);

router.get('/doctors/:doctorId', getDoctorProfile);

router.get('/me', getProfile);
router.patch('/me', validate(updateProfileSchema), updateProfile);
router.delete('/me', deleteAccount);

router.get('/', getAllUsers);
router.get('/:userId', getUserById);
router.patch('/:userId/ban', banUser);

export default router;
