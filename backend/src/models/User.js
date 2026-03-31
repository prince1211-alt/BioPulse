import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
    },

    password_hash: {
      type: String,
      required: true,
    },

    refresh_token: {
      type: String,
    },

    role: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
      default: 'patient',
    },

    fcm_token: {
      type: String,
    },

    calorie_goal: {
      type: Number,
    },

    conditions: {
      type: [String],
      default: [],
    },

    allergies: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model('User', userSchema);