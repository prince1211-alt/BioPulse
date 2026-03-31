import Redis from 'ioredis';
import { env } from './env.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  lazyConnect: true,
  connectTimeout: 15000,
  retryStrategy(times) {
    if (times > 10) {
      return null; // give up silently
    }
    return Math.min(times * 1000, 5000);
  }
});

redisConnection.on('connect', () => {
  console.log('✅ [Redis] Connected successfully');
});

redisConnection.on('error', () => {
  // Suppress all Redis errors — server stays alive, jobs queue when reconnected
});

// Returns a promise that resolves when Redis connects OR after 20s timeout
// so the server always starts regardless of Redis availability
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
      resolve(false); // don't reject — server must start
    });
});
