import { Router } from 'express';
import { getProfile, updateProfile, getDoctorProfile, getAllUsers, getUserById, deleteAccount } from '../controllers/user.controller.js';
import { banUser } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.use(authenticate);

router.get('/doctors/:doctorId', getDoctorProfile);

router.get('/me', getProfile);
router.patch('/me', updateProfile);
router.delete('/me', deleteAccount);

router.get('/', getAllUsers);
router.get('/:userId', getUserById);
router.patch('/:userId/ban', banUser);

export default router;
