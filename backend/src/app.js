import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import medicineRoutes from './routes/medicine.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import reportRoutes from './routes/report.routes.js';
import dietRoutes from './routes/diet.routes.js';

const app = express();

app.use(helmet()); // protect from browser based attacks
app.use(cors({ origin: env.FRONTEND_URL, credentials: true })); // allow requests from frontend
app.use(express.json()); // parse json bodies
app.use(cookieParser()); // parse cookies

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/medicines', medicineRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/diet', dietRoutes);


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'BioPulse API is running' });
});

app.use(errorHandler);

export default app;
