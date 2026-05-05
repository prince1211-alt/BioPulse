import { Appointment, Doctor } from '../models/Appointment.js';
import { User } from '../models/User.js';

// ── Appointment ──────────────────────────────────────────────────────────────

export const findAppointmentsByUser = async (userId, userRole) => {
  const filter = userRole === 'doctor' ? { doctor_id: userId } : { user_id: userId };
  return await Appointment.find(filter)
    .populate('doctor_id', 'name specialisation avatar_url')
    .populate('user_id', 'name email age')
    .sort({ scheduled_at: 1 })
    .lean();
};

export const findAppointmentByFilter = async (filter) => {
  return await Appointment.findOne(filter);
};

export const createAppointment = async (data) => {
  return await Appointment.create(data);
};

export const findConflictingAppointment = async (doctorId, scheduledAt, excludeId = null) => {
  const filter = { doctor_id: doctorId, scheduled_at: scheduledAt, status: { $ne: 'cancelled' } };
  if (excludeId) filter._id = { $ne: excludeId };
  return await Appointment.findOne(filter);
};

// ── Doctor ───────────────────────────────────────────────────────────────────

export const findDoctorsList = async (filter) => {
  return await User.find({ role: 'doctor', ...filter })
    .select('name specialisation qualification experience_years avatar_url consultation_fee')
    .lean();
};

export const findDoctorById = async (doctorId) => {
  return await Doctor.findById(doctorId);
};

export const findOrCreateDoctor = async (doctorId) => {
  let doc = await Doctor.findById(doctorId);
  if (!doc) {
    doc = new Doctor({ _id: doctorId, available_slots: [] });
  }
  return doc;
};
