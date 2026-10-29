import mongoose from 'mongoose';
import { env } from './env.js';

export default async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
}
