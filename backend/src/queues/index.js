import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { AppError } from '../utils/AppError.js';

// HTTP requests must fail promptly if Redis is offline; workers can keep retrying.
const apiConnection = redisConnection.duplicate({ maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
apiConnection.on('error', () => {});
export const requireQueue = () => {
  if (apiConnection.status !== 'ready') throw new AppError('Background processing is unavailable. Please try again shortly.', 503, 'QUEUE_UNAVAILABLE');
};

export const medicineReminderQueue = new Queue('medicine-reminders', { connection: apiConnection });
export const appointmentReminderQueue = new Queue('appointment-reminders', { connection: apiConnection });
export const ocrQueue = new Queue('report-ocr', { connection: apiConnection });
export const aiAnalysisQueue = new Queue('report-ai-analysis', { connection: apiConnection });
export const stockCheckQueue = new Queue('low-stock-check', { connection: apiConnection });
export const dietReminderQueue = new Queue('diet-reminders', { connection: apiConnection });

for (const queue of [medicineReminderQueue, appointmentReminderQueue, ocrQueue, aiAnalysisQueue, stockCheckQueue, dietReminderQueue]) {
  queue.on('error', err => { if (redisConnection.status === 'ready') console.warn(`[Queue:${queue.name}]`, err.message); });
}

export const closeQueues = async () => {
  await Promise.allSettled([medicineReminderQueue, appointmentReminderQueue, ocrQueue, aiAnalysisQueue, stockCheckQueue, dietReminderQueue].map(queue => queue.close()));
  apiConnection.disconnect();
};
