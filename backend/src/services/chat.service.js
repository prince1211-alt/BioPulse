import axios from 'axios';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export const chatHealthAssistant = async (userId, message, history) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const systemPrompt = `You are BioPulse's advanced 24/7 AI Health Assistant.
Your goal is to provide helpful, evidence-based, compassionate, and easy-to-understand health information.
The patient profile:
- Name: ${user.name}
- Age: ${user.age || 'Not provided'}
- Gender: ${user.gender || 'Not provided'}
- Chronic Conditions: ${(user.chronic_conditions || user.conditions || []).join(', ') || 'None reported'}
- Allergies: ${(user.allergies || []).join(', ') || 'None reported'}

Instructions:
1. Always be empathetic, clear, and encouraging. Use bullet points and simple terms.
2. If the user asks about their chronic conditions, allergies, diet, or reports, address them contextually based on their profile.
3. Do NOT make firm medical diagnoses, prescribe specific dosages, or replace professional medical consultations. Always recommend consulting a certified doctor on BioPulse for serious symptoms.
4. Keep responses concise (under 250 words) and structure them beautifully with markdown.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || []).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.6,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const reply = response.data.choices[0].message.content.trim();
    return { reply };
  } catch (err) {
    console.error('Health Chatbot error:', err.response?.data || err.message);
    throw new AppError('AI Health Assistant failed to generate a response', 500, 'SERVER_ERROR');
  }
};
