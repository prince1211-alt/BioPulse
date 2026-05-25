import { Appointment } from '../models/Appointment.js';
import { User } from '../models/User.js';
import { Schedule } from '../models/Schedule.js';

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

export const countAppointments = async (filter) => {
  return await Appointment.countDocuments(filter);
};

export const findDoctorsList = async (filter) => {
  return await User.find({ role: 'doctor', ...filter })
    .select('name specialisation qualification experience_years avatar_url consultation_fee')
    .lean();
};

export const findDoctorById = async (doctorId) => {
  return await User.findOne({ _id: doctorId, role: 'doctor' });
};

export const createSchedule = async (data) => {
  return await Schedule.create(data);
};

export const findSchedulesByDoctor = async (doctorId) => {
  return await Schedule.find({ doctor_id: doctorId }).sort({ date: 1, start_time: 1 });
};

export const findScheduleByIdAndDoctor = async (scheduleId, doctorId) => {
  return await Schedule.findOne({ _id: scheduleId, doctor_id: doctorId });
};

export const deleteSchedule = async (scheduleId) => {
  return await Schedule.findByIdAndDelete(scheduleId);
};

export const findScheduleForSlot = async (doctorId, dateString) => {
  
  return await Schedule.findOne({
    doctor_id: doctorId,
    date: dateString,
  });
};

export const updateSlotBookingCount = async (scheduleId, slotId, increment) => {
  return await Schedule.findOneAndUpdate(
    { _id: scheduleId, 'slots._id': slotId },
    { $inc: { 'slots.$.booked': increment } },
    { returnDocument: 'after' }
  );
};
