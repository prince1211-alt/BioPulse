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
import notificationRoutes from './routes/notification.routes.js';
import prescriptionRoutes from './routes/prescription.routes.js';
import chatRoutes         from './routes/chat.routes.js';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: (origin, cb) => {
      
      if (!origin) return cb(null, true);

      if (env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }

      if (env.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      cb(new Error(`CORS: Origin "${origin}" not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-timezone'],
  })
);

const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, 
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
  skipSuccessfulRequests: false,
});

const apiLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, 
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});

app.use(compression());

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({
    status:    'ok',
    message:   'BioPulse API is running',
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  });
});

app.use('/api/v1/auth',         authLimiter, authRoutes);
app.use('/api/v1/users',        apiLimiter,  userRoutes);
app.use('/api/v1/medicines',    apiLimiter,  medicineRoutes);
app.use('/api/v1/appointments', apiLimiter,  appointmentRoutes);
app.use('/api/v1/reports',      apiLimiter,  reportRoutes);
app.use('/api/v1/diet',         apiLimiter,  dietRoutes);
app.use('/api/v1/notifications',apiLimiter,  notificationRoutes);
app.use('/api/v1/prescriptions',apiLimiter,  prescriptionRoutes);
app.use('/api/v1/chat',          apiLimiter,  chatRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

app.use(errorHandler);

export default app;
