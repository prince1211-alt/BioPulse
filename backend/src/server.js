import http from 'http';
import { env } from './config/env.js';
import app from './app.js';
import connectDB from './config/db.js';
import { startWorkers } from './workers/index.js';
import { initSocket } from './config/socket.js';
import { connectRedis } from './config/redis.js';
import { initCronJobs } from './cron.js';

const server = http.createServer(app);

const io = initSocket(server);

let activeWorkers = [];

const startServer = async () => {
  try {
    
    await connectDB();
    console.log('✅ MongoDB connected');

    const redisReady = await connectRedis();

    if (redisReady) {
      try {
        // Set up pub/sub relay for real-time notifications (only when Redis is available)
        const { redisConnection } = await import('./config/redis.js');
        const subscriber = redisConnection.duplicate();

        // Suppress unhandled errors on the subscriber connection
        subscriber.on('error', (err) => {
          console.warn('⚠️  [Redis Subscriber] Error (non-fatal):', err.message);
        });

        subscriber.subscribe('notifications', (err) => {
          if (err) console.error('❌ Redis subscriber error:', err.message);
        });

        subscriber.on('message', (channel, message) => {
          if (channel === 'notifications') {
            try {
              const { userId, payload } = JSON.parse(message);
              io.to(userId).emit('notification', { ...payload, time: new Date() });
              console.log(`📡 [SocketRelay] Emitted ${payload.type} to user ${userId}`);
            } catch (err) {
              console.error('❌ Socket relay parse error:', err.message);
            }
          }
        });

        activeWorkers = await startWorkers();
        console.log(`⚙️  Background workers initialized (${activeWorkers.length} workers)`);
      } catch (workerErr) {
        console.warn('⚠️  [Workers] Failed to start:', workerErr.message);
      }
    } else {
      console.warn('⚠️  [Workers] Skipped — Redis not available. API is fully operational.');
    }

    initCronJobs();

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${env.PORT} already in use. Kill the process and restart.`);
      } else {
        console.error('❌ Server error:', err.message);
      }
      process.exit(1);
    });

    server.listen(env.PORT, () => {
      console.log(`🚀 BioPulse backend running → http://localhost:${env.PORT}`);
      console.log(`   Environment : ${env.NODE_ENV}`);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

async function shutdown(signal) {
  console.log(`\n📴 Received ${signal} — shutting down gracefully...`);

  server.close(async () => {
    console.log('✅ HTTP server closed');

    if (activeWorkers.length > 0) {
      console.log(`⏳ Closing ${activeWorkers.length} worker(s)...`);
      await Promise.allSettled(activeWorkers.map((w) => w.close()));
      console.log('✅ Workers closed');
    }

    try {
      const mongoose = await import('mongoose');
      await mongoose.default.disconnect();
      console.log('✅ MongoDB disconnected');
    } catch (err) {
      console.warn('⚠️  MongoDB disconnect error:', err.message);
    }

    console.log('👋 Shutdown complete');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('❌ Forced shutdown — timeout exceeded');
    process.exit(1);
  }, 15_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM')); 
process.on('SIGINT',  () => shutdown('SIGINT'));  
process.once('SIGUSR2', () => {
  server.close(() => {
    process.kill(process.pid, 'SIGUSR2');
  });
}); 

process.on('unhandledRejection', (reason) => {
  // Log but do NOT exit — Redis / external service blips should not crash the server
  console.error('❌ Unhandled Promise Rejection (non-fatal):', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1); 
});

startServer();
