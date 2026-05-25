

export const calculateBMR = ({ weight, height, age, gender }) => {
  if (!weight || !height || !age) {
    throw new Error('INVALID_USER_DATA');
  }

  return gender === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;
};

export const calculateCalories = (bmr, goal = 'maintenance', activityLevel = 'moderate') => {
  const activityMultipliers = {
    sedentary:  1.2,   
    light:      1.375, 
    moderate:   1.55,  
    active:     1.725, 
    very_active: 1.9,  
  };

  const goalAdjustments = {
    weight_loss:  -500, 
    weight_gain:  +500, 
    maintenance:    0,
  };

  const tdee       = bmr * (activityMultipliers[activityLevel] || 1.55);
  const adjustment = goalAdjustments[goal] ?? 0;

  const rawCalories = Math.round(tdee + adjustment);

  if (rawCalories > 5000) {
    return 2400;
  }

  return Math.min(Math.max(rawCalories, 1200), 4000);
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MEAL_SPLIT = {
  breakfast: 0.25,
  lunch:     0.35,
  snack:     0.10,
  dinner:    0.30,
};

const CONDITION_RESTRICTIONS = {
  diabetes:     { avoid: ['sugar', 'white rice', 'white bread', 'soda', 'candy', 'pastries'] },
  hypertension: { avoid: ['salt', 'processed meat', 'canned food', 'fast food'] },
  cholesterol:  { avoid: ['fried food', 'red meat', 'full-fat dairy', 'trans fats'] },
  kidney:       { avoid: ['high-potassium foods', 'high-phosphorus foods', 'excess protein'] },
};

export const generateMeals = (calories, options = {}) => {
  const { conditions = [], allergies = [], goal = 'maintenance' } = options;

  const avoidList = [
    ...allergies,
    ...conditions.flatMap((c) => CONDITION_RESTRICTIONS[c.toLowerCase()]?.avoid ?? []),
  ];

  const macroSplit =
    goal === 'weight_loss'
      ? { protein: 0.35, carbs: 0.40, fat: 0.25 }
      : goal === 'weight_gain'
      ? { protein: 0.25, carbs: 0.50, fat: 0.25 }
      : { protein: 0.25, carbs: 0.50, fat: 0.25 }; 

  return DAYS.map((day) => ({
    day,
    restrictions: avoidList.length > 0 ? avoidList : null,
    meals: Object.entries(MEAL_SPLIT).reduce((acc, [meal, ratio]) => {
      const mealCalories = Math.round(calories * ratio);

      acc[meal] = [{
        name:     `${capitalize(meal)} meal`,
        calories: mealCalories,
        macros: {
          
          protein: Math.round((mealCalories * macroSplit.protein) / 4),
          carbs:   Math.round((mealCalories * macroSplit.carbs)   / 4),
          fat:     Math.round((mealCalories * macroSplit.fat)     / 9),
        },
      }];

      return acc;
    }, {}),
  }));
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
