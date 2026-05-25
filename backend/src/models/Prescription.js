import mongoose from 'mongoose';

const prescriptionSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appointment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: false,  // Optional for templates
    },
    diagnosis: {
      type: String,
      required: true,
    },
    symptoms: {
      type: [String],
      default: [],
    },
    medicines: [
      {
        name: { type: String, required: true },
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        duration: { type: String, required: true },
        instructions: { type: String, default: '' },
      }
    ],
    advice: {
      type: String,
      default: '',
    },
    is_template: {
      type: Boolean,
      default: false,
    },
    template_name: {
      type: String,
    }
  },
  {
    timestamps: true,
  }
);

export const Prescription = mongoose.model('Prescription', prescriptionSchema);
