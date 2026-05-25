import { Router } from 'express';
import { chatHealthAssistant } from '../controllers/chat.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.use(authenticate);

router.post('/health', chatHealthAssistant);

export default router;
