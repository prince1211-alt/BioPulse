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
      ref: 'User',
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
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'no_show'],
      default: 'scheduled',
    },
    token_number: {
      type: Number,
    },
    queue_status: {
      type: String,
      enum: ['waiting', 'in_consultation', 'completed', 'no_show'],
      default: 'waiting',
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

export const Appointment = mongoose.model('Appointment', appointmentSchema);