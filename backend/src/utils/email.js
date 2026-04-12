import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// ─── Transporter ──────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host:   env.SMTP_HOST,
  port:   parseInt(env.SMTP_PORT, 10),
  secure: env.SMTP_PORT === '465', // true for port 465, STARTTLS for 587
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  // Prevent hanging connections
  connectionTimeout: 10_000,
  greetingTimeout:   5_000,
  socketTimeout:     10_000,
});

// Verify transporter config on startup (non-blocking)
if (env.NODE_ENV !== 'test') {
  transporter.verify().catch((err) => {
    console.warn('⚠️  [Email] SMTP connection check failed:', err.message);
    console.warn('⚠️  [Email] Email notifications will be disabled until SMTP is reachable.');
  });
}

// ─── sendEmail ────────────────────────────────────────────────────────────────

/**
 * @param {string} to       - recipient email
 * @param {string} subject
 * @param {string} html     - HTML body
 * @param {string} [text]   - plain-text fallback (auto-generated if omitted)
 */
export const sendEmail = async (to, subject, html, text) => {
  if (env.NODE_ENV === 'test') return;

  if (!to || !subject || !html) {
    console.warn('[Email] Skipped — missing required fields (to, subject, html)');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from:    `"BioPulse Health" <${env.SMTP_USER}>`,
      to,
      subject,
      html,
      text:    text || html.replace(/<[^>]*>/g, ''), // strip tags as plain fallback
    });

    console.log(`✅ [Email] Sent → ${to} | messageId: ${info.messageId}`);
  } catch (err) {
    // Log but never throw — email failure must not crash workers or requests
    console.error(`❌ [Email] Failed to send to ${to}:`, err.message);
  }
};

// ─── Pre-built templates ──────────────────────────────────────────────────────

export const emailTemplates = {
  medicineReminder: (medicineName, dosage) => ({
    subject: '💊 BioPulse — Medicine Reminder',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">⏰ Time to take your medicine</h2>
        <p>Please take <strong>${dosage}</strong> of <strong>${medicineName}</strong> now.</p>
        <p style="color:#6b7280;font-size:12px">BioPulse Health — your personal health companion</p>
      </div>`,
  }),

  appointmentReminder: (doctorName, scheduledAt, type) => ({
    subject: '📅 BioPulse — Appointment Reminder',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">📅 Upcoming Appointment</h2>
        <p>You have a <strong>${type}</strong> with <strong>Dr. ${doctorName}</strong>.</p>
        <p>📅 <strong>${new Date(scheduledAt).toLocaleString()}</strong></p>
        <p style="color:#6b7280;font-size:12px">BioPulse Health</p>
      </div>`,
  }),

  lowStockAlert: (medicineName, remaining) => ({
    subject: '⚠️ BioPulse — Low Medicine Stock',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#dc2626">⚠️ Low Stock Warning</h2>
        <p><strong>${medicineName}</strong> is running low — only <strong>${remaining}</strong> dose(s) remaining.</p>
        <p>Please refill soon to avoid missing doses.</p>
        <p style="color:#6b7280;font-size:12px">BioPulse Health</p>
      </div>`,
  }),
};
