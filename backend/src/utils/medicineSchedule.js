import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { AppError } from './AppError.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const validateTimezone = (tz = 'Asia/Kolkata') => {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); }
  catch { throw new AppError('Invalid timezone', 400, 'INVALID_TIMEZONE'); }
  return tz;
};

export const parseMedicineDate = (value, tz, end = false) => {
  if (value == null) return value;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? dayjs.tz(value, tz)[end ? 'endOf' : 'startOf']('day').toDate()
    : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new AppError('Invalid medicine date', 400, 'INVALID_DATE');
  return date;
};

export const medicineDays = med => {
  if (med.frequency === 'weekly') return [dayjs(med.start_date).tz(med.timezone || 'Asia/Kolkata').day()];
  if (med.frequency === 'custom') return med.days_of_week || [];
  return [0, 1, 2, 3, 4, 5, 6];
};

export const dosesForDate = (med, dateStr) => {
  const tz = med.timezone || 'Asia/Kolkata';
  const date = dayjs.tz(`${dateStr}T12:00:00`, tz);
  if (!medicineDays(med).includes(date.day())) return [];
  return med.times.map(time => {
    const local = dayjs.tz(`${dateStr}T${time}:00`, tz);
    return local.format('YYYY-MM-DD HH:mm') === `${dateStr} ${time}` ? local.toDate() : null;
  }).filter(Boolean)
    .filter(time => time >= new Date(med.start_date) && (!med.end_date || time <= new Date(med.end_date)));
};

export const expectedDoses = (med, since, until) => {
  const tz = med.timezone || 'Asia/Kolkata';
  let date = dayjs(since).tz(tz).startOf('day');
  const last = dayjs(until).tz(tz).format('YYYY-MM-DD');
  const result = [];
  while (date.format('YYYY-MM-DD') <= last) {
    result.push(...dosesForDate(med, date.format('YYYY-MM-DD')).filter(time => time >= since && time <= until));
    date = date.add(1, 'day');
  }
  return result;
};
