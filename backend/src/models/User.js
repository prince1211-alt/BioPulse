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

    avatar_url: {
      type: String,
    },

    age: {
      type: Number,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    height: {
      type: Number,
    },
    weight: {
      type: Number,
    },
    blood_group: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    },
    calorie_goal: {
      type: Number,
    },

    specialisation: {
      type: String,
    },
    qualification: {
      type: String,
    },
    experience_years: {
      type: Number,
    },
    bio: {
      type: String,
    },
    consultation_fee: {
      type: Number,
    },
    clinic_address: {
      type: String,
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