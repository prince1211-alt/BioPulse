// ─── BMR (Mifflin-St Jeor) ────────────────────────────────────────────────────

export const calculateBMR = ({ weight, height, age, gender }) => {
  if (!weight || !height || !age) {
    throw new Error('INVALID_USER_DATA');
  }

  // weight in kg, height in cm
  return gender === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;
};

// ─── TDEE + goal adjustment ───────────────────────────────────────────────────

export const calculateCalories = (bmr, goal = 'maintenance', activityLevel = 'moderate') => {
  const activityMultipliers = {
    sedentary:  1.2,   // desk job, no exercise
    light:      1.375, // 1-3 days/week
    moderate:   1.55,  // 3-5 days/week  ← default
    active:     1.725, // 6-7 days/week
    very_active: 1.9,  // physical job + training
  };

  const goalAdjustments = {
    weight_loss:  -500, // 500 kcal deficit
    weight_gain:  +500, // 500 kcal surplus
    maintenance:    0,
  };

  const tdee       = bmr * (activityMultipliers[activityLevel] || 1.55);
  const adjustment = goalAdjustments[goal] ?? 0;

  return Math.max(Math.round(tdee + adjustment), 1200); // never below 1200 kcal
};

// ─── MEAL PLAN GENERATOR ─────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Meal split ratios
const MEAL_SPLIT = {
  breakfast: 0.25,
  lunch:     0.35,
  snack:     0.10,
  dinner:    0.30,
};

// Condition-specific food restrictions
const CONDITION_RESTRICTIONS = {
  diabetes:     { avoid: ['sugar', 'white rice', 'white bread', 'soda', 'candy', 'pastries'] },
  hypertension: { avoid: ['salt', 'processed meat', 'canned food', 'fast food'] },
  cholesterol:  { avoid: ['fried food', 'red meat', 'full-fat dairy', 'trans fats'] },
  kidney:       { avoid: ['high-potassium foods', 'high-phosphorus foods', 'excess protein'] },
};

/**
 * generateMeals
 * @param {number} calories   - daily calorie target
 * @param {object} [options]
 * @param {string[]} [options.conditions]  - e.g. ['diabetes', 'hypertension']
 * @param {string[]} [options.allergies]   - e.g. ['nuts', 'gluten']
 * @param {string}  [options.goal]         - 'weight_loss' | 'weight_gain' | 'maintenance'
 */
export const generateMeals = (calories, options = {}) => {
  const { conditions = [], allergies = [], goal = 'maintenance' } = options;

  // Collect all restrictions
  const avoidList = [
    ...allergies,
    ...conditions.flatMap((c) => CONDITION_RESTRICTIONS[c.toLowerCase()]?.avoid ?? []),
  ];

  // Macro split varies by goal
  const macroSplit =
    goal === 'weight_loss'
      ? { protein: 0.35, carbs: 0.40, fat: 0.25 }
      : goal === 'weight_gain'
      ? { protein: 0.25, carbs: 0.50, fat: 0.25 }
      : { protein: 0.25, carbs: 0.50, fat: 0.25 }; // maintenance

  return DAYS.map((day) => ({
    day,
    restrictions: avoidList.length > 0 ? avoidList : null,
    meals: Object.entries(MEAL_SPLIT).reduce((acc, [meal, ratio]) => {
      const mealCalories = Math.round(calories * ratio);

      acc[meal] = {
        name:     `${capitalize(meal)} meal`,
        calories: mealCalories,
        macros: {
          // kcal → grams: protein & carbs = 4 kcal/g, fat = 9 kcal/g
          protein: Math.round((mealCalories * macroSplit.protein) / 4),
          carbs:   Math.round((mealCalories * macroSplit.carbs)   / 4),
          fat:     Math.round((mealCalories * macroSplit.fat)     / 9),
        },
      };

      return acc;
    }, {}),
  }));
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
