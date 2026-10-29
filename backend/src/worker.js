import './config/env.js';
import mongoose from 'mongoose';
import { startWorkers } from './workers/index.js';
import { connectRedis, redisConnection } from './config/redis.js';
import { closeQueues } from './queues/index.js';

try {
  if (!await connectRedis()) throw new Error('Redis is required for the worker process');
  const workers = await startWorkers();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 15000).unref();
    await Promise.allSettled(workers.map(worker => worker.close()));
    await closeQueues();
    redisConnection.disconnect();
    await mongoose.disconnect();
    clearTimeout(timer);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} catch (err) {
  console.error('Worker startup failed:', err.message);
  await closeQueues();
  redisConnection.disconnect();
  await mongoose.disconnect();
  process.exitCode = 1;
}
