import 'dotenv/config';
import http from 'http';
import { env } from './config/env.js';
import app from './app.js';
import connectDB from './config/db.js';
import { startWorkers } from './workers/index.js';
import { initSocket } from './config/socket.js';

const server = http.createServer(app);

// Initialize WebSockets
initSocket(server);

const startServer = async () => {
  try {
    await connectDB();
    
    startWorkers();

    server.listen(env.PORT, () => {
      console.log(`🚀 BioPulse backend running on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
