import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';

import authRoutes        from './routes/auth.routes.js';
import userRoutes        from './routes/user.routes.js';
import medicineRoutes    from './routes/medicine.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import reportRoutes      from './routes/report.routes.js';
import dietRoutes        from './routes/diet.routes.js';

const app = express();

// ─── Security ──────────────────────────────────────────────────────────────────

app.use(helmet());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return cb(null, true);

      const allowed = Array.isArray(env.FRONTEND_URL)
        ? env.FRONTEND_URL
        : [env.FRONTEND_URL];

      if (allowed.includes(origin)) return cb(null, true);

      cb(new Error(`CORS: Origin "${origin}" not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Rate limiting ────────────────────────────────────────────────────────────

// Strict limiter for auth routes (brute-force protection)
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
  skipSuccessfulRequests: false,
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});

// ─── Compression ──────────────────────────────────────────────────────────────

app.use(compression());

// ─── Logging ──────────────────────────────────────────────────────────────────

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Body parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ─── Health check (no auth, no rate limit) ───────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status:    'ok',
    message:   'BioPulse API is running',
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/v1/auth',         authLimiter, authRoutes);
app.use('/api/v1/users',        apiLimiter,  userRoutes);
app.use('/api/v1/medicines',    apiLimiter,  medicineRoutes);
app.use('/api/v1/appointments', apiLimiter,  appointmentRoutes);
app.use('/api/v1/reports',      apiLimiter,  reportRoutes);
app.use('/api/v1/diet',         apiLimiter,  dietRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use(errorHandler);

export default app;
