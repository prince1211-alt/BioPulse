import { api } from './axios.js';

export const chatApi = {
  healthChat: (data) => api.post('/chat/health', data),
};
