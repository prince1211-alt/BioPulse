import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: parseInt(env.SMTP_PORT, 10),
  secure: env.SMTP_PORT === '465',
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const sendEmail = async (to, subject, html) => {
  if (env.NODE_ENV === 'test') return;
  
  await transporter.sendMail({
    from: `"BioPulse Health" <${env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
};
