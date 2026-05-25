import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as appointmentService from '../services/appointment.service.js';

export const getDoctors = asyncHandler(async (req, res) => {
  const doctors = await appointmentService.getDoctorsList(req.query.specialisation);
  return success(res, doctors);
});

export const getDoctorSchedules = asyncHandler(async (req, res) => {
  const schedules = await appointmentService.getDoctorSchedules(req.params.id);
  return success(res, schedules);
});

export const addSchedule = asyncHandler(async (req, res) => {
  const schedule = await appointmentService.addDoctorSchedule(req.userId, req.body);
  return success(res, schedule, `Schedule created with ${schedule.slots.length} slots`);
});

export const removeSchedule = asyncHandler(async (req, res) => {
  const result = await appointmentService.removeDoctorSchedule(req.userId, req.body.id);
  return success(res, result, 'Schedule removed successfully');
});

export const getAppointments = asyncHandler(async (req, res) => {
  const list = await appointmentService.getUserAppointments(req.userId, req.userRole);
  return success(res, list);
});

export const bookAppointment = asyncHandler(async (req, res) => {
  const apptObj = await appointmentService.bookAppointment(req.userId, req.body);
  return success(res, apptObj, 'Appointment booked', 201);
});

export const rescheduleAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.rescheduleAppointment(req.userId, req.params.id, req.body.new_scheduled_at);
  return success(res, appointment, 'Appointment rescheduled');
});

export const autoBook = asyncHandler(async (req, res) => {
  const apptObj = await appointmentService.autoBookAppointment(req.userId, req.body);
  return success(res, apptObj, 'Auto-booked appointment', 201);
});

export const cancelAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.cancelAppointment(req.userId, req.userRole, req.params.id);
  return success(res, result);
});

export const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.updateAppointmentStatus(req.userId, req.params.id, req.body.status);
  return success(res, appointment);
});

export const updateQueueStatus = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.updateQueueStatus(req.userId, req.params.id, req.body.queue_status);
  return success(res, appointment, 'Queue status updated');
});

export const getDoctorQueue = asyncHandler(async (req, res) => {
  const result = await appointmentService.getDoctorQueueStatus(req.params.id);
  return success(res, result);
});
