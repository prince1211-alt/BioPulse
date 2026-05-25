

const PATIENT_DIET_RULES = {
  general: {
    label: 'General',
    note: 'Balanced meals with lean protein, complex carbs, fruits, and vegetables.',
    breakfast: [
      { name: 'Oatmeal with berries and nuts', calories: 420, macros: { protein: 12, carbs: 55, fat: 16 } },
      { name: 'Full English breakfast (Healthy version)', calories: 580, macros: { protein: 32, carbs: 45, fat: 30 } },
      { name: 'Avocado toast with eggs', calories: 450, macros: { protein: 22, carbs: 32, fat: 26 } },
    ],
    lunch: [
      { name: 'Grilled chicken with quinoa bowl', calories: 680, macros: { protein: 45, carbs: 65, fat: 26 } },
      { name: 'Pasta Primavera with tofu', calories: 620, macros: { protein: 28, carbs: 80, fat: 20 } },
      { name: 'Fish with roasted sweet potato', calories: 590, macros: { protein: 38, carbs: 55, fat: 24 } },
    ],
    snack: [
      { name: 'Greek yogurt with granola', calories: 240, macros: { protein: 18, carbs: 25, fat: 8 } },
      { name: 'Mixed nuts and dark chocolate', calories: 210, macros: { protein: 6, carbs: 12, fat: 15 } },
      { name: 'Apple and peanut butter', calories: 220, macros: { protein: 5, carbs: 22, fat: 12 } },
    ],
    dinner: [
      { name: 'Salmon steak with asparagus', calories: 650, macros: { protein: 42, carbs: 22, fat: 43 } },
      { name: 'Chicken curry with brown rice', calories: 720, macros: { protein: 48, carbs: 70, fat: 28 } },
      { name: 'Lentil stew with whole grain bread', calories: 580, macros: { protein: 26, carbs: 85, fat: 15 } },
    ],
    avoidKeywords: ['soda', 'deep fried', 'energy drink'],
  },

  diabetic: {
    label: 'Diabetic',
    note: 'Lower sugar, higher fiber, and steady-energy meals.',
    breakfast: [
      { name: 'High-fiber vegetable omelette', calories: 380, macros: { protein: 28, carbs: 12, fat: 24 } },
      { name: 'Steel-cut oats with flaxseeds', calories: 410, macros: { protein: 14, carbs: 55, fat: 15 } },
      { name: 'Chia seed pudding with almonds', calories: 360, macros: { protein: 12, carbs: 22, fat: 25 } },
    ],
    lunch: [
      { name: 'Mediterranean chicken salad', calories: 540, macros: { protein: 42, carbs: 20, fat: 32 } },
      { name: 'Lentil and kale soup bowl', calories: 520, macros: { protein: 26, carbs: 65, fat: 17 } },
      { name: 'Tofu stir-fry with cauliflower rice', calories: 510, macros: { protein: 34, carbs: 24, fat: 31 } },
    ],
    snack: [
      { name: 'Roasted chickpeas', calories: 180, macros: { protein: 10, carbs: 25, fat: 4 } },
      { name: 'Cottage cheese with berries', calories: 190, macros: { protein: 22, carbs: 14, fat: 5 } },
      { name: 'Walnuts and celery', calories: 210, macros: { protein: 4, carbs: 8, fat: 18 } },
    ],
    dinner: [
      { name: 'Baked trout with lemon and herbs', calories: 580, macros: { protein: 45, carbs: 15, fat: 38 } },
      { name: 'Lean beef and broccoli stir-fry', calories: 620, macros: { protein: 48, carbs: 22, fat: 38 } },
      { name: 'Grilled paneer with sautéed greens', calories: 560, macros: { protein: 32, carbs: 18, fat: 40 } },
    ],
    avoidKeywords: ['sugar', 'sweetened', 'juice', 'soda', 'dessert'],
  },

  hypertensive: {
    label: 'Hypertensive',
    note: 'Low sodium, high potassium meals. Avoid processed and salty food.',
    breakfast: [
      { name: 'Banana walnut oatmeal (No salt)', calories: 440, macros: { protein: 12, carbs: 65, fat: 15 } },
      { name: 'Buckwheat pancakes with berries', calories: 460, macros: { protein: 14, carbs: 75, fat: 12 } },
      { name: 'Yogurt parfaits with seeds', calories: 390, macros: { protein: 20, carbs: 45, fat: 15 } },
    ],
    lunch: [
      { name: 'No-salt grilled chicken breast', calories: 580, macros: { protein: 48, carbs: 45, fat: 22 } },
      { name: 'Quinoa and black bean bowl', calories: 610, macros: { protein: 24, carbs: 90, fat: 17 } },
      { name: 'Baked cod with roasted potato', calories: 550, macros: { protein: 36, carbs: 60, fat: 18 } },
    ],
    snack: [
      { name: 'Fresh melon bowl', calories: 120, macros: { protein: 2, carbs: 28, fat: 0 } },
      { name: 'Unsalted sunflower seeds', calories: 180, macros: { protein: 6, carbs: 6, fat: 15 } },
      { name: 'Pears with cinnamon', calories: 140, macros: { protein: 1, carbs: 34, fat: 0 } },
    ],
    dinner: [
      { name: 'Unsalted roast turkey breast', calories: 620, macros: { protein: 55, carbs: 30, fat: 31 } },
      { name: 'Vegetable korma with brown rice', calories: 680, macros: { protein: 20, carbs: 95, fat: 25 } },
      { name: 'White bean and spinach pasta', calories: 640, macros: { protein: 24, carbs: 90, fat: 20 } },
    ],
    avoidKeywords: ['chips', 'processed', 'instant noodles', 'pickles', 'fast food'],
  },

  renal: {
    label: 'Renal',
    note: 'Moderate protein and careful mineral choices. Adjust to clinician advice.',
    breakfast: [
      { name: 'Rice and egg white stir-fry', calories: 380, macros: { protein: 22, carbs: 55, fat: 8 } },
      { name: 'Cream of wheat with apple', calories: 360, macros: { protein: 10, carbs: 75, fat: 2 } },
      { name: 'Sourdough toast with jam', calories: 340, macros: { protein: 8, carbs: 70, fat: 3 } },
    ],
    lunch: [
      { name: 'Small chicken portion with white rice', calories: 520, macros: { protein: 28, carbs: 85, fat: 7 } },
      { name: 'Vegetable risotto (Low mineral)', calories: 540, macros: { protein: 12, carbs: 105, fat: 8 } },
      { name: 'White fish with pasta', calories: 510, macros: { protein: 32, carbs: 75, fat: 9 } },
    ],
    snack: [
      { name: 'Green grapes', calories: 110, macros: { protein: 1, carbs: 26, fat: 0 } },
      { name: 'Berries with honey', calories: 130, macros: { protein: 1, carbs: 31, fat: 0 } },
      { name: 'Plain biscuits', calories: 160, macros: { protein: 2, carbs: 30, fat: 4 } },
    ],
    dinner: [
      { name: 'Turkey breast with white noodles', calories: 580, macros: { protein: 34, carbs: 85, fat: 11 } },
      { name: 'Pasta with light oil and herbs', calories: 620, macros: { protein: 14, carbs: 110, fat: 13 } },
      { name: 'Small cod portion with white rice', calories: 550, macros: { protein: 30, carbs: 90, fat: 8 } },
    ],
    avoidKeywords: ['banana', 'orange juice', 'processed meat', 'cola'],
  },
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

/**
 * Picks the correct diet key from a user object.
 * Checks multiple field names for flexibility.
 */
export const normalizePatientType = (user = {}) => {
  const raw =
    user.patient_type ??
    user.patientType ??
    user.type ??
    user.patient ??
    user.category ??
    'general';

  const key = normalizeText(raw);
  return PATIENT_DIET_RULES[key] ? key : 'general';
};

export const getPatientDietRules = (patientType = 'general') => {
  const key = PATIENT_DIET_RULES[patientType] ? patientType : 'general';
  return PATIENT_DIET_RULES[key];
};

export const buildAutoRecommendations = (patientType = 'general') => {
  const rules = getPatientDietRules(patientType);

  return {
    breakfast: rules.breakfast.map((item) => ({ ...item, meal_type: 'breakfast' })),
    lunch:     rules.lunch.map((item)     => ({ ...item, meal_type: 'lunch' })),
    snack:     rules.snack.map((item)     => ({ ...item, meal_type: 'snack' })),
    dinner:    rules.dinner.map((item)    => ({ ...item, meal_type: 'dinner' })),
    note:      rules.note,
    label:     rules.label,
    avoidKeywords: rules.avoidKeywords,
  };
};

export const getPatientDietWarnings = (patientType = 'general', items = []) => {
  const rules = getPatientDietRules(patientType);
  const avoid = rules.avoidKeywords || [];

  return items
    .map((item) => {
      const name    = normalizeText(item?.name);
      const matched = avoid.find((bad) => name.includes(bad));
      return matched
        ? `"${item?.name || 'unknown'}" may not suit ${rules.label} diet (contains: ${matched}).`
        : null;
    })
    .filter(Boolean);
};

export { PATIENT_DIET_RULES };
