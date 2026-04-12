import { Router } from 'express';
import { register, login, logout, refreshAccessToken, changePassword, verifyAuth } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/logout', authenticate, logout);
router.post('/refresh', refreshAccessToken);
router.patch('/password', authenticate, changePassword);
router.get('/me', authenticate, verifyAuth);

export default router;
