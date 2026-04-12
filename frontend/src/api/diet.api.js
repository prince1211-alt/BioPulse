import { api } from './axios.js';

export const dietApi = {
  // GET /diet/current
  getCurrent: () => api.get('/diet/current'),

  // GET /diet/history?page=1&limit=10
  getHistory: (params) => api.get('/diet/history', { params }),

  // POST /diet/generate
  generate: () => api.post('/diet/generate'),

  // PATCH /diet/:id
  // body: any of { meals, total_calories, goal, notes }
  update: (id, data) => api.patch(`/diet/${id}`, data),

  // DELETE /diet/:id
  delete: (id) => api.delete(`/diet/${id}`),

  // POST /diet/meal
  // body: { meal_type: 'breakfast'|'lunch'|'dinner'|'snack', items: [...] }
  addCustomMeal: (data) => api.post('/diet/meal', data),

  // GET /diet/search?q=apple
  searchFoods: (q) => api.get('/diet/search', { params: { q } }),
};