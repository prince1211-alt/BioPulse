import axios from 'axios';
import { env } from '../config/env.js';

const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const TIMEOUT_MS    = 8000;
const MAX_RETRIES   = 2;

// ─── Nutrient name → short key ────────────────────────────────────────────────

const NUTRIENT_MAP = {
  'Energy':                       'calories',
  'Protein':                      'protein',
  'Carbohydrate, by difference':  'carbs',
  'Total lipid (fat)':            'fat',
  'Fiber, total dietary':         'fiber',
  'Sugars, total including NLEA': 'sugar',
  'Sodium, Na':                   'sodium',
};

const getNutrient = (nutrients, name) =>
  nutrients.find((n) => n.nutrientName === name)?.value ?? 0;

// ─── searchFoodsFromAPI ───────────────────────────────────────────────────────

/**
 * @param {string} query     - search term (min 2 chars)
 * @param {number} [pageSize=10]
 * @returns {Promise<Array>}
 */
export const searchFoodsFromAPI = async (query, pageSize = 10) => {
  if (!query || query.trim().length < 2) return [];

  const apiKey = env.USDA_API_KEY || process.env.USDA_API_KEY;
  if (!apiKey) {
    console.warn('[FoodSearch] USDA_API_KEY not set — returning empty results');
    return [];
  }

  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(USDA_BASE_URL, {
        params: {
          api_key:  apiKey,
          query:    query.trim(),
          pageSize: Math.min(pageSize, 25),
          dataType: 'Foundation,SR Legacy', // prefer verified nutrient data
        },
        timeout: TIMEOUT_MS,
      });

      const foods = response.data?.foods ?? [];

      return foods.map((food) => {
        const nutrients = food.foodNutrients || [];

        return {
          id:          food.fdcId,
          name:        food.description,
          brand:       food.brandOwner || null,
          category:    food.foodCategory || null,
          calories:    getNutrient(nutrients, 'Energy'),
          protein:     getNutrient(nutrients, 'Protein'),
          carbs:       getNutrient(nutrients, 'Carbohydrate, by difference'),
          fat:         getNutrient(nutrients, 'Total lipid (fat)'),
          fiber:       getNutrient(nutrients, 'Fiber, total dietary'),
          sugar:       getNutrient(nutrients, 'Sugars, total including NLEA'),
          sodium:      getNutrient(nutrients, 'Sodium, Na'),
          serving_size: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : null,
        };
      });

    } catch (err) {
      lastErr = err;

      // Don't retry on 4xx (bad key, bad query) — only on network / 5xx
      if (err.response?.status >= 400 && err.response?.status < 500) break;

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  console.error('[FoodSearch] USDA API failed:', lastErr?.message);
  throw new Error('FOOD_API_ERROR');
};
