import mongoose from 'mongoose';

const mealItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  calories: {
    type: Number,
    required: true
  },
  macros: {
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
  },
  quantity: {
    type: Number,
    default: 1
  }
});

const dayPlanSchema = new mongoose.Schema(
  {
    day: {
      type: String,
    },
    meals: {
      breakfast: [mealItemSchema],
      lunch: [mealItemSchema],
      snack: [mealItemSchema],
      dinner: [mealItemSchema],
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
    
    patient_type: {
      type: String,
      default: 'general',
    },
    goal: {
      type: String,
    },
    bmr: {
      type: Number,
    },
    notes: {
      type: String,
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