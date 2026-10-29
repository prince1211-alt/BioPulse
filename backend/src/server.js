import http from 'node:http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import app from './app.js';
import connectDB from './config/db.js';
import { startWorkers } from './workers/index.js';
import { initSocket } from './config/socket.js';
import { connectRedis, redisConnection } from './config/redis.js';
import { initCronJobs, stopCronJobs } from './cron.js';
import { closeQueues } from './queues/index.js';

const server = http.createServer(app);
const io = initSocket(server);
let subscriber, backgroundStart;
let workers = [];
let stopping = false;

async function startBackground() {
  if (stopping || backgroundStart) return backgroundStart;
  backgroundStart = (async () => {
    subscriber = redisConnection.duplicate({ lazyConnect: false });
    subscriber.on('error', err => console.warn('[Notifications] Redis relay error:', err.message));
    subscriber.on('message', (channel, message) => {
      if (channel !== 'notifications') return;
      try {
        const { userId, payload } = JSON.parse(message);
        io.to(String(userId)).emit('notification', { ...payload, time: new Date() });
      } catch (err) { console.warn('[Notifications] Invalid relay payload:', err.message); }
    });
    await subscriber.subscribe('notifications');
    if (process.env.RUN_WORKERS !== 'false') workers = await startWorkers();
    initCronJobs();
    console.log(`[Background] Started ${workers.length} workers`);
  })().catch(err => {
    subscriber?.disconnect();
    backgroundStart = null;
    console.warn('[Background] Startup failed:', err.message);
  });
  return backgroundStart;
}

async function shutdown(signal, code = 0) {
  if (stopping) return;
  stopping = true;
  console.log(`[Server] Shutting down: ${signal}`);
  const timer = setTimeout(() => process.exit(1), 15000).unref();
  redisConnection.off('ready', onRedisReady);
  stopCronJobs();
  await new Promise(resolve => io.close(resolve));
  await Promise.allSettled(workers.map(worker => worker.close()));
  subscriber?.disconnect();
  await closeQueues();
  redisConnection.disconnect();
  await mongoose.disconnect();
  clearTimeout(timer);
  process.exitCode = code;
}
const onRedisReady = () => { void startBackground(); };
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('unhandledRejection', err => {
  console.error('[Server] Unhandled rejection:', err);
  void shutdown('unhandledRejection', 1);
}); 
process.on('uncaughtException', err => {
  console.error('[Server] Uncaught exception:', err);
  void shutdown('uncaughtException', 1);
});
server.on('error', err => { console.error('[Server]', err.message); void shutdown('server error', 1); });

try {
  await connectDB();
  // A delayed Redis recovery can start background processing after HTTP startup.
  redisConnection.on('ready', onRedisReady);
  if (await connectRedis()) await startBackground();
  else console.warn('[Background] Redis unavailable; report uploads and medicine edits return 503 until recovery');
  server.listen(env.PORT, () => console.log(`BioPulse API listening on port ${env.PORT}`));
} catch (err) {
  console.error('[Server] Startup failed:', err.message);
  await shutdown('startup failure', 1);
}
