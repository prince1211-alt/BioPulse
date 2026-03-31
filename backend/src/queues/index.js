import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

export const medicineReminderQueue = new Queue('medicine-reminders', { connection: redisConnection });
export const appointmentReminderQueue = new Queue('appointment-reminders', { connection: redisConnection });
export const ocrQueue = new Queue('report-ocr', { connection: redisConnection });
export const aiAnalysisQueue = new Queue('report-ai-analysis', { connection: redisConnection });
export const stockCheckQueue = new Queue('low-stock-check', { connection: redisConnection });
