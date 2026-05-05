import { describe, it, expect } from 'vitest';
import { calculateBMR, calculateCalories, generateMeals } from '../healthUtils.js';

describe('healthUtils', () => {
  describe('calculateBMR', () => {
    it('calculates BMR for a female correctly', () => {
      const user = { weight: 60, height: 165, age: 30, gender: 'female' };
      const bmr = calculateBMR(user);
      // 10 * 60 + 6.25 * 165 - 5 * 30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
      expect(bmr).toBe(1320.25);
    });

    it('calculates BMR for a male correctly', () => {
      const user = { weight: 80, height: 180, age: 30, gender: 'male' };
      const bmr = calculateBMR(user);
      // 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780
      expect(bmr).toBe(1780);
    });

    it('throws error if user data is incomplete', () => {
      const user = { weight: 80, age: 30 }; // missing height
      expect(() => calculateBMR(user)).toThrow('INVALID_USER_DATA');
    });
  });

  describe('calculateCalories', () => {
    it('calculates maintenance calories correctly', () => {
      // 2000 BMR, sedentary (1.2) = 2400
      const cals = calculateCalories(2000, 'maintenance', 'sedentary');
      expect(cals).toBe(2400);
    });

    it('calculates weight loss calories correctly', () => {
      // 2000 BMR, active (1.725) = 3450 - 500 = 2950
      const cals = calculateCalories(2000, 'weight_loss', 'active');
      expect(cals).toBe(2950);
    });

    it('never returns calories below 1200', () => {
      // 1000 BMR, sedentary (1.2) = 1200 - 500 (weight loss) = 700 (should cap at 1200)
      const cals = calculateCalories(1000, 'weight_loss', 'sedentary');
      expect(cals).toBe(1200);
    });
  });

  describe('generateMeals', () => {
    it('generates a 7-day meal plan with correct structure', () => {
      const plan = generateMeals(2000, { goal: 'maintenance' });
      expect(plan).toHaveLength(7);
      expect(plan[0].day).toBe('Monday');
      expect(plan[0].meals).toHaveProperty('breakfast');
      expect(plan[0].meals).toHaveProperty('lunch');
      expect(plan[0].meals).toHaveProperty('snack');
      expect(plan[0].meals).toHaveProperty('dinner');
    });

    it('calculates total calories per day correctly', () => {
      const plan = generateMeals(2000, { goal: 'maintenance' });
      const monday = plan[0].meals;
      const totalCals = monday.breakfast.calories + monday.lunch.calories + monday.snack.calories + monday.dinner.calories;
      // Should be roughly equal to 2000, might be a tiny bit off due to rounding, but our ratios sum to 1.
      expect(totalCals).toBe(2000);
    });

    it('includes restrictions based on conditions', () => {
      const plan = generateMeals(2000, { conditions: ['diabetes'], allergies: ['peanuts'] });
      expect(plan[0].restrictions).toContain('peanuts');
      expect(plan[0].restrictions).toContain('sugar'); // diabetes avoid list
    });
  });
});
