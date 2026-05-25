import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as chatService from '../services/chat.service.js';

export const chatHealthAssistant = asyncHandler(async (req, res) => {
  const { message, history } = req.body;
  const result = await chatService.chatHealthAssistant(req.userId, message, history);
  return success(res, result, 'Chat response generated');
});
