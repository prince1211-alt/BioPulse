import cron from 'node-cron';
import { dietReminderQueue, requireQueue } from './queues/index.js';

let cronJobs = [];

export const initCronJobs = () => {
  
  cronJobs.forEach(job => job.stop());
  cronJobs = [];

  console.log('⏰ Initializing CRON jobs...');

  const breakfastJob = cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Dispatching Breakfast reminders');
    try {
      requireQueue();
      await dietReminderQueue.add('breakfast-reminder', { mealName: 'Breakfast' }, { removeOnComplete: true });
    } catch (err) { console.warn('[Cron] Reminder dispatch failed:', err.message); }
  }, { scheduled: true, timezone: "Asia/Kolkata" });

  const lunchJob = cron.schedule('0 13 * * *', async () => {
    console.log('⏰ Dispatching Lunch reminders');
    try {
      requireQueue();
      await dietReminderQueue.add('lunch-reminder', { mealName: 'Lunch' }, { removeOnComplete: true });
    } catch (err) { console.warn('[Cron] Reminder dispatch failed:', err.message); }
  }, { scheduled: true, timezone: "Asia/Kolkata" });

  const dinnerJob = cron.schedule('0 19 * * *', async () => {
    console.log('⏰ Dispatching Dinner reminders');
    try {
      requireQueue();
      await dietReminderQueue.add('dinner-reminder', { mealName: 'Dinner' }, { removeOnComplete: true });
    } catch (err) { console.warn('[Cron] Reminder dispatch failed:', err.message); }
  }, { scheduled: true, timezone: "Asia/Kolkata" });

  cronJobs.push(breakfastJob, lunchJob, dinnerJob);
};

export const stopCronJobs = () => { cronJobs.forEach(job => job.stop()); cronJobs = []; };
