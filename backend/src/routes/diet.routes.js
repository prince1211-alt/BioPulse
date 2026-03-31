import { Router } from 'express';
import { getCurrentPlan, generatePlan, searchFoods } from '../controllers/diet.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/current', getCurrentPlan);
router.post('/generate', generatePlan);
router.get('/foods/search', searchFoods);

export default router;
