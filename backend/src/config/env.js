import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
  'NODE_ENV'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.warn(`⚠️ Warning: Environment variable ${envVar} is not set.`);
  }
});

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || '4000',
  DATABASE_URL: process.env.DATABASE_URL || 'mongodb://localhost:27017/biopulse',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  ALLOWED_ORIGINS: (process.env.FRONTEND_URL || 'http://localhost:5173')
    .replace(/["']/g, '')
    .split(',')
    .map(u => u.trim()),
  JWT_SECRET: process.env.JWT_SECRET || 'secret1',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'secret2',  
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.ethereal.email',
  SMTP_PORT: process.env.SMTP_PORT || '587',
  SMTP_USER: process.env.SMTP_USER || 'mock',
  SMTP_PASS: process.env.SMTP_PASS || 'mock',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'mock'
};

console.log(`📡 [Config] Environment PORT: ${process.env.PORT}, Final PORT: ${env.PORT}`);

