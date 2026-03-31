import mongoose from 'mongoose';

const mealSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    calories: {
      type: Number,
    },
    macros: {
      protein: {
        type: Number,
      },
      carbs: {
        type: Number,
      },
      fat: {
        type: Number,
      },
    },
  },
  { _id: false }
);

const dayPlanSchema = new mongoose.Schema(
  {
    day: {
      type: String,
    },
    meals: {
      breakfast: mealSchema,
      lunch: mealSchema,
      snack: mealSchema,
      dinner: mealSchema,
    },
  },
  { _id: false }
);

const dietPlanSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    week_start: {
      type: Date,
      required: true,
    },
    total_calories: {
      type: Number,
      required: true,
    },
    ai_generated: {
      type: Boolean,
      default: false,
    },
    meals: [dayPlanSchema],
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const DietPlan = mongoose.model('DietPlan', dietPlanSchema);