import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    dosage: {
      type: Number,
      required: true,
    },

    unit: {
      type: String,
      required: true,
    },

    frequency: {
      type: String,
      required: true,
    },

    times: {
      type: [String],
      required: true,
    },

    food_instruction: {
      type: String,
    },

    start_date: {
      type: Date,
      required: true,
    },

    end_date: {
      type: Date,
    },

    days_supply: {
      type: Number,
    },

    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const medicineLogSchema = new mongoose.Schema(
  {
    medicine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    scheduled_at: {
      type: Date,
      required: true,
    },

    taken_at: {
      type: Date,
    },

    status: {
      type: String,
      enum: ['pending', 'taken', 'skipped', 'snoozed'],
      default: 'pending',
    },

    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Medicine = mongoose.model('Medicine', medicineSchema);
export const MedicineLog = mongoose.model('MedicineLog', medicineLogSchema);