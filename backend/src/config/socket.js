import { Server } from 'socket.io';
import { env } from './env.js';
import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/User.js';

let io;
export const initSocket = server => {
  io = new Server(server, { cors: { origin: env.ALLOWED_ORIGINS, credentials: true } });
  io.use(async (socket, next) => {
    try {
      const decoded = verifyToken(socket.handshake.auth?.token);
      const user = await User.findById(decoded.id).select('is_banned token_version').lean();
      if (!user || user.is_banned || (decoded.version || 0) !== (user.token_version || 0)) throw new Error('Invalid session');
      socket.data.userId = String(user._id);
      socket.data.expiresAt = decoded.exp * 1000;
      next();
    } catch { next(new Error('Authentication required')); }
  });
  io.on('connection', socket => {
    socket.join(socket.data.userId);
    // No client-selected rooms: identity comes exclusively from the verified JWT.
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
    timer.unref();
    socket.on('disconnect', () => clearTimeout(timer));
  });
  return io;
};
export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

export const disconnectUserSockets = userId => io?.in(String(userId)).disconnectSockets(true);
