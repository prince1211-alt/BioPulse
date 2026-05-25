import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema({
  time: {
    type: Date,
    required: true,
  },
  booked: {
    type: Number,
    default: 0,
  },
});

const scheduleSchema = new mongoose.Schema(
  {
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String, 
      required: true,
    },
    start_time: {
      type: String, 
      required: true,
    },
    end_time: {
      type: String, 
      required: true,
    },
    slot_duration: {
      type: Number, 
      required: true,
      min: 5,
    },
    max_patients: {
      type: Number, 
      required: true,
      min: 1,
      default: 1,
    },
    slots: {
      type: [slotSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Schedule = mongoose.model('Schedule', scheduleSchema);
