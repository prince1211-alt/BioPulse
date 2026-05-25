import { Prescription } from '../models/Prescription.js';
import { Appointment } from '../models/Appointment.js';
import { AppError } from '../utils/AppError.js';

export const createPrescription = async (doctorId, data) => {
  const { patient_id, appointment_id, diagnosis, symptoms, medicines, advice, is_template, template_name } = data;

  // Verify appointment
  const appointment = await Appointment.findOne({ _id: appointment_id, doctor_id: doctorId });
  if (!appointment) {
    throw new AppError('Appointment not found or not assigned to this doctor', 404, 'NOT_FOUND');
  }

  // Create prescription
  const prescription = await Prescription.create({
    patient_id,
    doctor_id: doctorId,
    appointment_id,
    diagnosis,
    symptoms: symptoms || [],
    medicines,
    advice: advice || '',
    is_template: !!is_template,
    template_name: template_name || undefined,
  });

  // Mark appointment as completed
  appointment.status = 'completed';
  appointment.queue_status = 'completed';
  await appointment.save();

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
