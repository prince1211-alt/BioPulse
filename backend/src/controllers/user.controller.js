import { User } from '../models/User.js';
import { success, error } from '../utils/response.js';

// ─── Allowed field maps by role ────────────────────────────────────────────────

const PATIENT_ALLOWED_FIELDS = [
  'name', 'age', 'gender', 'height', 'weight',
  'calorie_goal', 'fcm_token', 'avatar_url',
  'blood_group', 'allergies', 'chronic_conditions',
  'emergency_contact',
];

const DOCTOR_ALLOWED_FIELDS = [
  'name', 'fcm_token', 'avatar_url',
  'specialisation', 'qualification', 'experience_years',
  'bio', 'consultation_fee', 'clinic_address', 'phone',
];

const ADMIN_ALLOWED_FIELDS = [
  ...PATIENT_ALLOWED_FIELDS,
  ...DOCTOR_ALLOWED_FIELDS,
  'role',
];

const getAllowedFields = (role) => {
  if (role === 'admin')  return ADMIN_ALLOWED_FIELDS;
  if (role === 'doctor') return DOCTOR_ALLOWED_FIELDS;
  return PATIENT_ALLOWED_FIELDS;
};

// ─── GET OWN PROFILE ──────────────────────────────────────────────────────────

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password_hash -refresh_token');

    if (!user) {
      return error(res, 'NOT_FOUND', 'User not found', 404);
    }

    return success(res, user);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch profile', 500);
  }
};

// ─── UPDATE OWN PROFILE ───────────────────────────────────────────────────────

export const updateProfile = async (req, res) => {
  try {
    const userId  = req.userId;
    const role    = req.userRole; // set by auth middleware
    const data    = req.body;

    const allowedFields = getAllowedFields(role);
    const updateData = {};

    allowedFields.forEach((field) => {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return error(res, 'VALIDATION_ERROR', 'No valid fields provided', 400);
    }

    // ── Patient-specific validations ──────────────────────────────────────────
    if (updateData.age !== undefined && (updateData.age < 0 || updateData.age > 120)) {
      return error(res, 'VALIDATION_ERROR', 'Invalid age', 400);
    }
    if (updateData.weight !== undefined && updateData.weight <= 0) {
      return error(res, 'VALIDATION_ERROR', 'Invalid weight', 400);
    }
    if (updateData.height !== undefined && updateData.height <= 0) {
      return error(res, 'VALIDATION_ERROR', 'Invalid height', 400);
    }
    if (updateData.blood_group !== undefined) {
      const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      if (!VALID_BLOOD_GROUPS.includes(updateData.blood_group)) {
        return error(res, 'VALIDATION_ERROR', 'Invalid blood group', 400);
      }
    }

    // ── Doctor-specific validations ───────────────────────────────────────────
    if (updateData.experience_years !== undefined && updateData.experience_years < 0) {
      return error(res, 'VALIDATION_ERROR', 'Invalid experience years', 400);
    }
    if (updateData.consultation_fee !== undefined && updateData.consultation_fee < 0) {
      return error(res, 'VALIDATION_ERROR', 'Invalid consultation fee', 400);
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true })
      .select('-password_hash -refresh_token');

    if (!user) {
      return error(res, 'NOT_FOUND', 'User not found', 404);
    }

    return success(res, user, 'Profile updated');
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to update profile', 500);
  }
};

// ─── GET PUBLIC DOCTOR PROFILE ────────────────────────────────────────────────

export const getDoctorProfile = async (req, res) => {
  try {
    const doctor = await User.findOne({
      _id: req.params.doctorId,
      role: 'doctor',
    }).select('name specialisation qualification experience_years bio consultation_fee clinic_address avatar_url');

    if (!doctor) {
      return error(res, 'NOT_FOUND', 'Doctor not found', 404);
    }

    return success(res, doctor);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch doctor profile', 500);
  }
};

// ─── ADMIN: GET ALL USERS ─────────────────────────────────────────────────────

export const getAllUsers = async (req, res) => {
  try {
    // requireRole('admin') middleware should guard this route
    const { role, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (role && ['patient', 'doctor', 'admin'].includes(role)) {
      filter.role = role;
    }

    const skip   = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit), 100);
    const lim    = Math.min(parseInt(limit), 100);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password_hash -refresh_token')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      User.countDocuments(filter),
    ]);

    return success(res, {
      page: parseInt(page),
      limit: lim,
      total,
      total_pages: Math.ceil(total / lim),
      users,
    });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch users', 500);
  }
};

// ─── ADMIN: GET USER BY ID ────────────────────────────────────────────────────

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password_hash -refresh_token')
      .lean();

    if (!user) {
      return error(res, 'NOT_FOUND', 'User not found', 404);
    }

    return success(res, user);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch user', 500);
  }
};

// ─── DELETE OWN ACCOUNT ───────────────────────────────────────────────────────

export const deleteAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.userId);
    if (!user) {
      return error(res, 'NOT_FOUND', 'User not found', 404);
    }

    res.clearCookie('refreshToken');
    return success(res, { deleted: true }, 'Account deleted');
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to delete account', 500);
  }
};
