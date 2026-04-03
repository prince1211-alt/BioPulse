import bcrypt from "bcrypt";
import { User } from "../models/User.js";
import { generateTokens, verifyRefreshToken } from "../utils/jwt.js";
import { success, error } from "../utils/response.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const ROLES = ["patient", "doctor", "admin"];

const ROLE_PERMISSIONS = {
  patient: ["read:own_reports", "write:own_reports", "read:appointments", "write:appointments", "read:diet", "write:diet", "read:medicines", "write:medicines"],
  doctor:  ["read:all_appointments", "write:all_appointments", "read:patient_reports", "manage:slots", "read:own_profile"],
  admin:   ["*"], // full access
};

// Strip sensitive fields before returning user objects
const sanitizeUser = (user) => {
  const obj = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete obj.password_hash;
  delete obj.refresh_token;
  return obj;
};

// ─── REGISTER ─────────────────────────────────────────────────────────────────

export const register = async (req, res) => {
  try {
    const { email, password, role, name, ...rest } = req.body;

    if (!email || !password) {
      return error(res, "VALIDATION_ERROR", "Email and password are required", 400);
    }
    if (!isValidEmail(email)) {
      return error(res, "VALIDATION_ERROR", "Invalid email format", 400);
    }
    if (password.length < 6) {
      return error(res, "VALIDATION_ERROR", "Password must be at least 6 characters", 400);
    }
    if (!name || name.trim().length < 2) {
      return error(res, "VALIDATION_ERROR", "Name is required (min 2 characters)", 400);
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return error(res, "EMAIL_EXISTS", "Email already in use", 400);
    }

    // Only allow 'patient' or 'doctor' during self-registration.
    // 'admin' role must be assigned manually or via seeding.
    const validRole = role && ["patient", "doctor"].includes(role) ? role : "patient";

    const password_hash = await bcrypt.hash(password, 10);

    const user = new User({
      email: email.toLowerCase(),
      password_hash,
      role: validRole,
      name: name.trim(),
      permissions: ROLE_PERMISSIONS[validRole],
      ...rest,
    });

    await user.save();

    const { accessToken, refreshToken } = generateTokens({
      id: user._id.toString(),
      role: user.role,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await User.findByIdAndUpdate(user._id, { refresh_token: hashedRefreshToken });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return success(
      res,
      { user: sanitizeUser(user), accessToken },
      "User registered successfully",
      201
    );
  } catch (err) {
    console.error("❌ Register Error:", err);
    return error(res, "SERVER_ERROR", "Registration failed", 500);
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return error(res, "VALIDATION_ERROR", "Email and password are required", 400);
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Avoid timing attacks — still hash even on miss
      await bcrypt.hash(password, 10);
      return error(res, "INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    if (user.is_banned) {
      return error(res, "ACCOUNT_BANNED", "Your account has been suspended", 403);
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return error(res, "INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const { accessToken, refreshToken } = generateTokens({
      id: user._id.toString(),
      role: user.role,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await User.findByIdAndUpdate(user._id, {
      refresh_token: hashedRefreshToken,
      last_login: new Date(),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return success(res, { user: sanitizeUser(user), accessToken }, "Login successful");
  } catch (err) {
    console.error("❌ Login Error:", err);
    return error(res, "SERVER_ERROR", "Login failed", 500);
  }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

export const logout = async (req, res) => {
  try {
    if (req.userId) {
      await User.findByIdAndUpdate(req.userId, { refresh_token: null });
    }
    res.clearCookie("refreshToken");
    return success(res, { loggedOut: true }, "Logout successful");
  } catch (err) {
    console.error("❌ Logout Error:", err);
    return error(res, "SERVER_ERROR", "Logout failed", 500);
  }
};

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

export const refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return error(res, "NO_TOKEN", "Refresh token missing", 401);
    }

    // Decode without verifying first to extract userId
    let decoded;
    try {
      decoded = verifyRefreshToken(token); // throws if invalid/expired
    } catch {
      return error(res, "INVALID_TOKEN", "Refresh token invalid or expired", 401);
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.refresh_token) {
      return error(res, "INVALID_TOKEN", "Session expired, please login again", 401);
    }

    const isMatch = await bcrypt.compare(token, user.refresh_token);
    if (!isMatch) {
      // Token reuse detected — invalidate all sessions
      await User.findByIdAndUpdate(user._id, { refresh_token: null });
      res.clearCookie("refreshToken");
      return error(res, "TOKEN_REUSE", "Token reuse detected, please login again", 401);
    }

    // Rotate tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens({
      id: user._id.toString(),
      role: user.role,
    });

    const hashedNew = await bcrypt.hash(newRefreshToken, 10);
    await User.findByIdAndUpdate(user._id, { refresh_token: hashedNew });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return success(res, { accessToken }, "Token refreshed");
  } catch (err) {
    console.error("❌ Refresh Error:", err);
    return error(res, "SERVER_ERROR", "Token refresh failed", 500);
  }
};

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────

export const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return error(res, "VALIDATION_ERROR", "Both current and new password are required", 400);
    }
    if (new_password.length < 6) {
      return error(res, "VALIDATION_ERROR", "New password must be at least 6 characters", 400);
    }
    if (current_password === new_password) {
      return error(res, "VALIDATION_ERROR", "New password must differ from current", 400);
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return error(res, "NOT_FOUND", "User not found", 404);
    }

    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) {
      return error(res, "INVALID_CREDENTIALS", "Current password is incorrect", 401);
    }

    user.password_hash = await bcrypt.hash(new_password, 10);
    user.refresh_token = null; // Invalidate all existing sessions
    await user.save();

    res.clearCookie("refreshToken");

    return success(res, { passwordChanged: true }, "Password changed. Please login again.");
  } catch (err) {
    console.error("❌ Change Password Error:", err);
    return error(res, "SERVER_ERROR", "Password change failed", 500);
  }
};

// ─── VERIFY AUTH ──────────────────────────────────────────────────────────────

export const verifyAuth = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("-password_hash -refresh_token")
      .lean();

    if (!user) {
      return error(res, "NOT_FOUND", "User not found", 404);
    }

    return success(res, user, "User verified successfully");
  } catch (err) {
    console.error("❌ Verify Error:", err);
    return error(res, "SERVER_ERROR", "Verification failed", 500);
  }
};

// ─── ADMIN: BAN / UNBAN USER ──────────────────────────────────────────────────

export const banUser = async (req, res) => {
  try {
    // requireRole('admin') middleware should guard this route
    const { userId } = req.params;
    const { ban } = req.body; // true = ban, false = unban

    const user = await User.findByIdAndUpdate(
      userId,
      { is_banned: !!ban, ...(ban ? { refresh_token: null } : {}) },
      { new: true }
    ).select("-password_hash -refresh_token");

    if (!user) {
      return error(res, "NOT_FOUND", "User not found", 404);
    }

    return success(res, user, `User ${ban ? "banned" : "unbanned"} successfully`);
  } catch (err) {
    console.error("❌ Ban User Error:", err);
    return error(res, "SERVER_ERROR", "Action failed", 500);
  }
};

// ─── INTERNAL HELPER ──────────────────────────────────────────────────────────

// Used by JWT middleware to validate stored refresh token hash
export const validateRefreshToken = async (userId, token) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.refresh_token) return false;
    return await bcrypt.compare(token, user.refresh_token);
  } catch (err) {
    console.error("❌ Refresh Token Validation Error:", err);
    return false;
  }
};
