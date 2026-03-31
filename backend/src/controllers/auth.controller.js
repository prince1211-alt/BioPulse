import bcrypt from "bcrypt";
import { User } from "../models/User.js";
import { generateTokens } from "../utils/jwt.js";
import { success, error } from "../utils/response.js";

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const register = async (req, res) => {
  try {
    const { email, password, role, ...rest } = req.body;
    if (!email || !password) {
      return error(res, "VALIDATION_ERROR", "Email and password are required", 400);
    }
    if (!isValidEmail(email)) {
      return error(res, "VALIDATION_ERROR", "Invalid email format", 400);
    }
    if (password.length < 6) {
      return error(res, "VALIDATION_ERROR", "Password must be at least 6 characters", 400);
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return error(res, "EMAIL_EXISTS", "Email already in use", 400);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const validRole = role && ['patient', 'doctor', 'admin'].includes(role) ? role : 'patient';

    const user = new User({
      email,
      password_hash: hashedPassword,
      role: validRole,
      ...rest,
    });

    await user.save();

    const userObj = user.toObject();
    delete userObj.password_hash;
    delete userObj.refresh_token;

    return success(res, userObj, "User registered successfully", 201);
  } catch (err) {
    console.error("❌ Register Error:", err);
    return error(res, "SERVER_ERROR", "Registration failed", 500);
  }
};



export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return error(res, "VALIDATION_ERROR", "Email and password are required", 400);
    }
    const user = await User.findOne({ email });
    if (!user) {
      return error(res, "INVALID_CREDENTIALS", "Invalid email or password", 401);
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
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    const userObj = user.toObject();
    delete userObj.password_hash;
    delete userObj.refresh_token;

    return success(res, { user: userObj, accessToken }, "Login successful");
  } catch (err) {
    console.error("❌ Login Error:", err);
    return error(res, "SERVER_ERROR", "Login failed", 500);
  }
};


export const logout = async (req, res) => {
  try {
    if (req.userId) {
      await User.findByIdAndUpdate(req.userId, {
        refresh_token: null,
      });
    }

    res.clearCookie("refreshToken");

    return success(res, { loggedOut: true }, "Logout successful");
  } catch (err) {
    console.error("❌ Logout Error:", err);
    return error(res, "SERVER_ERROR", "Logout failed", 500);
  }
};


// VALIDATE REFRESH TOKEN
export const validateRefreshToken = async (userId, token) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.refresh_token) return false;

    // 🔥 Compare hashed token
    const isMatch = await bcrypt.compare(token, user.refresh_token);
    return isMatch;
  } catch (err) {
    console.error("❌ Refresh Token Validation Error:", err);
    return false;
  }
};

export const verifyAuth = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password_hash -refresh_token").lean();
    if (!user) {
      return error(res, "NOT_FOUND", "User not found", 404);
    }
    return success(res, user, "User verified successfully");
  } catch (err) {
    console.error("❌ Verify Error:", err);
    return error(res, "SERVER_ERROR", "Verification failed", 500);
  }
};