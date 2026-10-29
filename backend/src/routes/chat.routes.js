import { validate } from '../middleware/validate.js';
import { chatSchema } from '../schemas/chat.schema.js';
import { Router } from 'express';
import { chatHealthAssistant } from '../controllers/chat.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.use(authenticate);

router.post('/health', validate(chatSchema), chatHealthAssistant);

export default router;
