import Redis from 'ioredis';
import { env } from './env.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  
  connectTimeout: 15000,
  retryStrategy(times) {
    if (times > 10) {
      return null; 
    }
    return Math.min(times * 1000, 5000);
  }
});

redisConnection.on('connect', () => {
  console.log('✅ [Redis] Connected successfully');
});

redisConnection.on('error', () => {
  
});

export const connectRedis = () => new Promise((resolve) => {
  const timeout = setTimeout(() => {
    console.warn('⚠️  [Redis] Connection timed out — starting server without background workers');
    resolve(false);
  }, 20000);

  redisConnection.connect()
    .then(() => {
      clearTimeout(timeout);
      resolve(true);
    })
    .catch(() => {
      clearTimeout(timeout);
      resolve(false); 
    });
});
