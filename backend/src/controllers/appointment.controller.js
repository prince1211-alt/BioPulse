import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as appointmentService from '../services/appointment.service.js';

export const getDoctors = asyncHandler(async (req, res) => {
  const doctors = await appointmentService.getDoctorsList(req.query.specialisation);
  return success(res, doctors);
});

export const getDoctorSlots = asyncHandler(async (req, res) => {
  const slots = await appointmentService.getDoctorSlots(req.params.id);
  return success(res, slots);
});

export const addSlots = asyncHandler(async (req, res) => {
  const slots = await appointmentService.addDoctorSlots(req.userId, req.body.slots);
  return success(res, slots, `${req.body.slots.length} slot(s) added`);
});

export const removeSlot = asyncHandler(async (req, res) => {
  const result = await appointmentService.removeDoctorSlot(req.userId, req.body.slot);
  return success(res, result);
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
