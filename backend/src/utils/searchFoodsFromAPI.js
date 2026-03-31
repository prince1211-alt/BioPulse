import axios from 'axios';

const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

export const searchFoodsFromAPI = async (query) => {
  if (!query || query.length < 2) return [];

  try {
    const response = await axios.get(USDA_BASE_URL, {
      params: {
        api_key: process.env.USDA_API_KEY,
        query,
        pageSize: 10
      },
      timeout: 5000
    });

    return response.data.foods.map(food => {
      const nutrients = food.foodNutrients || [];

      const getNutrient = (name) =>
        nutrients.find(n => n.nutrientName === name)?.value || 0;

      return {
        id: food.fdcId,
        name: food.description,
        calories: getNutrient('Energy'),
        protein: getNutrient('Protein'),
        carbs: getNutrient('Carbohydrate, by difference'),
        fat: getNutrient('Total lipid (fat)')
      };
    });

  } catch (err) {
    console.error('USDA API error:', err.message);
    throw new Error('FOOD_API_ERROR');
  }
};