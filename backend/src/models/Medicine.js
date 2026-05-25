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
      type: String,   
      required: true,
    },

    unit: {
      type: String,   
    },

    frequency: {
      type: String,   
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
      default: Date.now,
    },

    end_date: {
      type: Date,
    },

    days_supply: {
      type: Number,
    },

    notes: {
      type: String,
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
      enum: ['pending', 'taken', 'missed', 'skipped', 'snoozed'],
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