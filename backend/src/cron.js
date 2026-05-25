import cron from 'node-cron';
import { dietReminderQueue } from './queues/index.js';

let cronJobs = [];

export const initCronJobs = () => {
  
  cronJobs.forEach(job => job.stop());
  cronJobs = [];

  console.log('⏰ Initializing CRON jobs...');

  const breakfastJob = cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Dispatching Breakfast reminders');
    await dietReminderQueue.add('breakfast-reminder', { mealName: 'Breakfast' }, { removeOnComplete: true });
  }, { scheduled: true, timezone: "Asia/Kolkata" });

  const lunchJob = cron.schedule('0 13 * * *', async () => {
    console.log('⏰ Dispatching Lunch reminders');
    await dietReminderQueue.add('lunch-reminder', { mealName: 'Lunch' }, { removeOnComplete: true });
  }, { scheduled: true, timezone: "Asia/Kolkata" });

  const dinnerJob = cron.schedule('0 19 * * *', async () => {
    console.log('⏰ Dispatching Dinner reminders');
    await dietReminderQueue.add('dinner-reminder', { mealName: 'Dinner' }, { removeOnComplete: true });
  }, { scheduled: true, timezone: "Asia/Kolkata" });

  cronJobs.push(breakfastJob, lunchJob, dinnerJob);
};
