export const calculateBMR = ({ weight, height, age, gender }) => {
  if (!weight || !height || !age) {
    throw new Error('INVALID_USER_DATA');
  }

  return gender === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;
};

export const calculateCalories = (bmr, goal = 'maintenance') => {
  const multipliers = {
    weight_loss: 0.8,
    weight_gain: 1.2,
    maintenance: 1
  };

  return Math.round(bmr * (multipliers[goal] || 1));
};

export const generateMeals = (calories) => {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  const split = {
    breakfast: 0.25,
    lunch: 0.35,
    snack: 0.1,
    dinner: 0.3
  };

  return days.map(day => ({
    day,
    meals: Object.entries(split).reduce((acc, [meal, ratio]) => {
      acc[meal] = {
        name: `${meal} meal`,
        calories: Math.round(calories * ratio),
        macros: {
          protein: Math.round(calories * 0.2 / 4),
          carbs: Math.round(calories * 0.5 / 4),
          fat: Math.round(calories * 0.3 / 9)
        }
      };
      return acc;
    }, {})
  }));
};