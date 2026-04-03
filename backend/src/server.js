import http from 'http';
import { env } from './config/env.js';
import app from './app.js';
import connectDB from './config/db.js';
import { startWorkers } from './workers/index.js';
import { initSocket } from './config/socket.js';
import { connectRedis } from './config/redis.js';

const server = http.createServer(app);

// Initialize WebSockets
initSocket(server);

// ─── Startup ──────────────────────────────────────────────────────────────────

let activeWorkers = [];

const startServer = async () => {
  try {
    // 1. Connect MongoDB
    await connectDB();
    console.log('✅ MongoDB connected');

    // 2. Connect Redis
    const redisReady = await connectRedis();

    // 3. Start BullMQ workers (only if Redis is up)
    if (redisReady) {
      try {
        activeWorkers = startWorkers();
        console.log(`⚙️  Background workers initialized (${activeWorkers.length} workers)`);
      } catch (workerErr) {
        console.warn('⚠️  [Workers] Failed to start:', workerErr.message);
      }
    } else {
      console.warn('⚠️  [Workers] Skipped — Redis not available. API is fully operational.');
    }

    // 4. Start HTTP server
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

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n📴 Received ${signal} — shutting down gracefully...`);

  // 1. Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');

    // 2. Close all BullMQ workers cleanly (finish in-progress jobs)
    if (activeWorkers.length > 0) {
      console.log(`⏳ Closing ${activeWorkers.length} worker(s)...`);
      await Promise.allSettled(activeWorkers.map((w) => w.close()));
      console.log('✅ Workers closed');
    }

    // 3. Disconnect Mongoose
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

  // Force exit after 15s if graceful shutdown stalls
  setTimeout(() => {
    console.error('❌ Forced shutdown — timeout exceeded');
    process.exit(1);
  }, 15_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker / Kubernetes stop
process.on('SIGINT',  () => shutdown('SIGINT'));  // Ctrl+C

// ─── Unhandled errors — log but don't crash in production ────────────────────

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  if (env.NODE_ENV !== 'production') process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1); // Always exit on uncaught — process is in unknown state
});

startServer();
