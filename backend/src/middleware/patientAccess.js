import mongoose from 'mongoose';
import { Appointment } from '../models/Appointment.js';
import { AppError } from '../utils/AppError.js';

// Patient records are accessible to the patient, an admin, or their treating doctor.
export const requirePatientAccess = param => async (req, _res, next) => {
  try {
    const patientId = req.params[param];
    if (!mongoose.isValidObjectId(patientId)) throw new AppError('Invalid patient ID', 400, 'INVALID_ID');
    if (req.userRole === 'admin' || patientId === req.userId) return next();
    if (req.userRole === 'doctor' && await Appointment.exists({
      doctor_id: req.userId, user_id: patientId, status: { $ne: 'cancelled' },
    })) return next();
    throw new AppError('Access to this patient is not permitted', 403, 'FORBIDDEN');
  } catch (err) { next(err); }
};
