import { Router } from 'express';
import { getCurrentPlan, getDietHistory, generatePlan, updatePlan, deletePlan, searchFoods, addCustomMeal } from '../controllers/diet.controller.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.use(authenticate);

router.get('/current', getCurrentPlan);
router.get('/history', getDietHistory);
router.post('/generate', generatePlan);
router.get('/search', searchFoods);
router.post('/meal', addCustomMeal);
router.patch('/:id', updatePlan);
router.delete('/:id', deletePlan);

export default router;
