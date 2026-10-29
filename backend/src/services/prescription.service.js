import mongoose from 'mongoose';
import { Schedule } from '../models/Schedule.js';
import { Prescription } from '../models/Prescription.js';
import { Appointment } from '../models/Appointment.js';
import { AppError } from '../utils/AppError.js';

export const createPrescription = async (doctorId, data) => {
  const { patient_id, appointment_id, diagnosis, symptoms, medicines, advice } = data;
  const session = await mongoose.startSession();
  let prescription;
  try {
    prescription = await session.withTransaction(async () => {
      const appointment = await Appointment.findOne({ _id: appointment_id, doctor_id: doctorId }).session(session);
      if (!appointment) throw new AppError('Appointment not assigned to this doctor', 404, 'NOT_FOUND');
      if (String(appointment.user_id) !== String(patient_id)) throw new AppError('Patient does not match the appointment', 400, 'VALIDATION_ERROR');
      if (['cancelled', 'no_show'].includes(appointment.status)) throw new AppError('Cannot prescribe for an inactive appointment', 400, 'INVALID_STATUS');
      if (await Prescription.exists({ appointment_id, is_template: false }).session(session)) throw new AppError('Prescription already exists for this appointment', 409, 'DUPLICATE_ERROR');
      const [created] = await Prescription.create([{ patient_id, doctor_id: doctorId, appointment_id, diagnosis, symptoms: symptoms || [], medicines, advice: advice || '', is_template: false }], { session });
      if (appointment.status !== 'completed') {
        await Schedule.updateOne({ doctor_id: doctorId, slots: { $elemMatch: { time: appointment.scheduled_at, booked: { $gt: 0 } } } }, { $inc: { 'slots.$.booked': -1 } }, { session });
      }
      appointment.status = 'completed';
      appointment.queue_status = 'completed';
      await appointment.save({ session });
      return created;
    });
  } finally { await session.endSession(); }

  await prescription.populate('patient_id', 'name email age gender');
  await prescription.populate('doctor_id', 'name specialisation qualification');

  return prescription;
};

export const getPatientPrescriptions = async (patientId) => {
  return await Prescription.find({ patient_id: patientId, is_template: false })
    .populate('doctor_id', 'name specialisation qualification clinic_address')
    .sort({ createdAt: -1 })
    .lean();
};

export const getDoctorPrescriptions = async (doctorId) => {
  return await Prescription.find({ doctor_id: doctorId, is_template: false })
    .populate('patient_id', 'name email age gender')
    .sort({ createdAt: -1 })
    .lean();
};

export const getPrescriptionById = async (id, userId, role) => {
  const query = { _id: id };
  if (role === 'patient') {
    query.patient_id = userId;
  } else if (role === 'doctor') {
    query.doctor_id = userId;
  }

  const prescription = await Prescription.findOne(query)
    .populate('patient_id', 'name email age gender blood_group weight height')
    .populate('doctor_id', 'name specialisation qualification clinic_address phone')
    .populate('appointment_id', 'scheduled_at')
    .lean();

  if (!prescription) {
    throw new AppError('Prescription not found or unauthorized access', 404, 'NOT_FOUND');
  }

  return prescription;
};

export const saveTemplate = async (doctorId, data) => {
  const { template_name, diagnosis, symptoms, medicines, advice } = data;

  if (!template_name?.trim()) throw new AppError('template_name is required', 400, 'VALIDATION_ERROR');

  return await Prescription.create({
    patient_id: doctorId,  // Self-reference for template (no real patient)
    doctor_id: doctorId,
    // No appointment_id for templates
    diagnosis,
    symptoms: symptoms || [],
    medicines,
    advice: advice || '',
    is_template: true,
    template_name: template_name.trim(),
  });
};

export const getTemplates = async (doctorId) => {
  return await Prescription.find({ doctor_id: doctorId, is_template: true })
    .sort({ template_name: 1 })
    .lean();
};
