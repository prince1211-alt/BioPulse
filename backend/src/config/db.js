import mongoose from 'mongoose';
import { env } from './env.js';

const connectDB = async () => {
  try {
    await mongoose.connect(env.DATABASE_URL);
    console.log('📦 MongoDB connected successfully');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB', error);
    process.exit(1);
  }
};

export default connectDB;
