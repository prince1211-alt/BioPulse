import Redis from 'ioredis';
import { env } from './env.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  
  connectTimeout: 15000,
  retryStrategy(times) {
    return Math.min(times * 1000, 5000);
  }
});

redisConnection.on('connect', () => {
  console.log('✅ [Redis] Connected successfully');
});

redisConnection.on('error', () => {
  
});

export const connectRedis = () => {
  if (redisConnection.status === 'ready') return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = ready => {
      clearTimeout(timeout);
      redisConnection.off('ready', onReady);
      redisConnection.off('end', onEnd);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onEnd = () => finish(false);
    const timeout = setTimeout(() => finish(false), 20_000);
    redisConnection.once('ready', onReady);
    redisConnection.once('end', onEnd);
    if (['wait', 'end'].includes(redisConnection.status)) redisConnection.connect().catch(() => finish(false));
  });
};
