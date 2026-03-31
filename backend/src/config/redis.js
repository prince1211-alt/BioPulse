import Redis from 'ioredis';
import { env } from './env.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    console.warn(`⚠️ [Redis] Offline. Retrying connection... (${times})`);
    return Math.min(times * 200, 5000); // retry every max 5s instead of crashing
  }
});

redisConnection.on('error', (err) => {
  // Suppress strict Error throws to allow backend to run
});
