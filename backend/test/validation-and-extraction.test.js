import { describe, it, expect, vi } from 'vitest';
import { registerSchema } from '../src/schemas/auth.schema.js';
import { createMedicineSchema } from '../src/schemas/medicine.schema.js';
import { dosesForDate, expectedDoses, validateTimezone } from '../src/utils/medicineSchedule.js';
import { cleanText, buildField, countNonNull } from '../src/utils/reportExtraction.js';
import { generateTokens } from '../src/utils/jwt.js';
import { errorHandler } from '../src/middleware/error.js';
import { uploadCloudinaryReport } from '../src/utils/cloudinary.js';

it('generates distinct refresh tokens even within the same second', () => {
  const payload = { id: '123456789012345678901234', role: 'patient' };
  expect(generateTokens(payload).refreshToken).not.toBe(generateTokens(payload).refreshToken);
});
it('rejects passwords over the bcrypt 72-byte limit', () => {
  expect(registerSchema.safeParse({ name: 'User', email: 'a@test.com', password: 'é'.repeat(40) }).success).toBe(false);
});
it('accepts nullable end dates and rejects invalid calendar dates', () => {
  const base = { name: 'Test', dosage: '1', times: ['08:00'] };
  expect(createMedicineSchema.parse({ ...base, end_date: null }).end_date).toBeNull();
  expect(createMedicineSchema.safeParse({ ...base, start_date: '2026-02-30' }).success).toBe(false);
});
it('rejects disguised upload content before sending it to storage', () => {
  expect(() => uploadCloudinaryReport({ buffer: Buffer.from('<html>test</html>'), mimetype: 'application/pdf' })).toThrow('File contents');
});
it('handles duplicate key errors without parsing fragile error strings', () => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    errorHandler({ code: 11000, errmsg: 'duplicate field without quotes' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  } finally { log.mockRestore(); }
});

describe('timezone-aware medicine schedules', () => {
  const med = { start_date: new Date('2026-01-01T00:00:00Z'), end_date: new Date('2026-01-03T23:59:59Z'), timezone: 'Asia/Kolkata', times: ['08:00', '20:00'], frequency: 'daily' };
  it('honors precise start/end boundaries and local times', () => {
    expect(dosesForDate(med, '2025-12-31')).toEqual([]);
    expect(dosesForDate(med, '2026-01-01').map(time => time.toISOString())).toEqual(['2026-01-01T02:30:00.000Z', '2026-01-01T14:30:00.000Z']);
    expect(expectedDoses(med, new Date('2026-01-01T10:00:00Z'), new Date('2026-01-02T04:00:00Z'))).toHaveLength(2);
  });
  it('honors weekly and custom weekdays', () => {
    expect(dosesForDate({ ...med, frequency: 'weekly' }, '2026-01-02')).toEqual([]);
    expect(dosesForDate({ ...med, frequency: 'custom', days_of_week: [5] }, '2026-01-02')).toHaveLength(2);
  });
  it('does not generate phantom doses on a DST clock-forward day', () => {
    const dst = { ...med, timezone: 'America/New_York', times: ['08:00'], start_date: new Date('2026-03-01'), end_date: null };
    expect(dosesForDate(dst, '2026-03-08')[0].toISOString()).toBe('2026-03-08T12:00:00.000Z');
    expect(dosesForDate({ ...dst, times: ['02:30'] }, '2026-03-08')).toEqual([]);
    expect(() => validateTimezone('not-a-timezone')).toThrow('Invalid timezone');
  });
});

describe('OCR normalization', () => {
  it('preserves micro units so creatinine can be converted', () => {
    const text = cleanText('Creatinine 88.4 μmol/l');
    const field = buildField([/Creatinine\s+(\d+(?:\.\d+)?)\s*(µmol\/l)/i], text, 'creatinine');
    expect(field.standard).toBeCloseTo(1);
    expect(field.original.unit).toBe('µmol/l');
  });
  it('uses the triglyceride conversion rather than cholesterol conversion', () => {
    const field = buildField([/TG\s+(\d+(?:\.\d+)?)\s*(mmol\/l)/i], 'TG 2 mmol/l', 'triglycerides');
    expect(field.standard).toBeCloseTo(177.14);
  });
  it('counts biomarkers rather than counting their duplicated values and unit strings', () => {
    expect(countNonNull({ diabetes: { glucose: { standard: 100, original: { value: 100, unit: 'mg/dl' } }, hba1c: null } })).toBe(1);
    expect(countNonNull({ diabetes: { glucose: null } })).toBe(0);
  });
});
