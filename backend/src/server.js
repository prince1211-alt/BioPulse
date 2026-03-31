// dotenv is loaded via src/config/env.js with explicit path resolution
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

const startServer = async () => {
  try {
    await connectDB();

    // Wait for Redis to connect before starting workers
    // This prevents BullMQ "Connection is closed" errors
    const redisReady = await connectRedis();

    if (redisReady) {
      try {
        startWorkers();
        console.log('⚙️  Background workers initialized');
      } catch (workerErr) {
        console.warn('⚠️  [Workers] Failed to start:', workerErr.message);
      }
    } else {
      console.warn('⚠️  [Workers] Skipped — Redis not available. API is fully operational.');
    }

    // Handle listen errors (e.g. EADDRINUSE) without crashing Node
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${env.PORT} is already in use. Kill the process using it and restart.`);
      } else {
        console.error('❌ Server error:', err.message);
      }
      process.exit(1);
    });

    server.listen(env.PORT, () => {
      console.log(`🚀 BioPulse backend running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
