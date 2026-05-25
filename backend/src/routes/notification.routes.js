import { Router } from 'express';
import { getNotifications, markAsRead } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);

export default router;
