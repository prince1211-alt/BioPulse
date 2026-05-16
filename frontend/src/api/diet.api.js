import { api } from './axios.js';

export const dietApi = {
  // GET /diet/current — returns active plan enriched with auto_recommendations
  getCurrent: () => api.get('/diet/current'),

  // GET /diet/history?page=1&limit=10
  getHistory: (params) => api.get('/diet/history', { params }),

  // GET /diet/recommendations — patient-type-aware meal suggestions (no plan needed)
  getRecommendations: () => api.get('/diet/recommendations'),

  // POST /diet/chat — body: { message, patient_type, history }
  chat: (data) => api.post('/diet/chat', data),

  // PATCH /diet/:id — partial update (meals, total_calories, goal, notes)
  update: (id, data) => api.patch(`/diet/${id}`, data),

  // DELETE /diet/:id
  delete: (id) => api.delete(`/diet/${id}`),

  // POST /diet/meal — add food item(s) to today's active plan
  // body: { meal_type: 'breakfast'|'lunch'|'dinner'|'snack', items: [...] }
  addCustomMeal: (data) => api.post('/diet/meal', data),

  // DELETE /diet/meal/:meal_type/:itemId
  removeCustomMeal: (mealType, itemId) => api.delete(`/diet/meal/${mealType}/${itemId}`),

  // GET /diet/search?q=apple — search external food database
  searchFoods: (q) => api.get('/diet/search', { params: { q } }),
};