import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    scheduled_at: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    auto_booked: {
      type: Boolean,
      default: false,
    },
    trigger_medicine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
    },
  },
  {
    timestamps: true,
  }
);

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    specialisation: {
      type: String,
      required: true,
    },
    hospital: {
      type: String,
      required: true,
    },
    available_slots: {
      type: [Date],
      default: [],
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Appointment = mongoose.model('Appointment', appointmentSchema);
export const Doctor = mongoose.model('Doctor', doctorSchema);