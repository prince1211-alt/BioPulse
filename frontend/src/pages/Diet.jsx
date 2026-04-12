import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Salad, Flame, Activity, Sparkles, RefreshCw,
  Plus, Trash2, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { dietApi } from '../api/diet.api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', color: 'bg-amber-100 text-amber-800' },
  { id: 'lunch',     label: 'Lunch',     color: 'bg-emerald-100 text-emerald-800' },
  { id: 'snack',     label: 'Snack',     color: 'bg-purple-100 text-purple-800' },
  { id: 'dinner',    label: 'Dinner',    color: 'bg-blue-100 text-blue-800' },
];

// ── Food search modal ─────────────────────────────────────────────────────────
function FoodSearchModal({ onClose, onAdd }) {
  const [q, setQ] = useState('');
  const [mealType, setMealType] = useState('breakfast');

  const { data, isLoading } = useQuery({
    queryKey: ['foodSearch', q],
    queryFn:  () => dietApi.searchFoods(q).then((r) => r.data?.data || r.data || []),
    enabled:  q.length >= 2,
  });

  const foods = Array.isArray(data) ? data : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col border">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-lg">Add Custom Meal</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 border-b space-y-3">
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {MEAL_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search food (e.g. apple, rice, chicken)…"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Searching…</p>}
          {!isLoading && q.length >= 2 && foods.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No foods found.</p>
          )}
          {foods.map((food) => (
            <button
              key={food.id}
              onClick={() =>
                onAdd(mealType, {
                  name:     food.name,
                  calories: food.calories,
                  macros:   { protein: food.protein, carbs: food.carbs, fat: food.fat },
                  brand:    food.brand,
                })
              }
              className="w-full text-left p-3 rounded-lg border hover:bg-primary/5 hover:border-primary/30 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm">{food.name}</p>
                  {food.brand && <p className="text-xs text-muted-foreground">{food.brand}</p>}
                </div>
                <span className="text-xs font-bold text-primary ml-3 shrink-0">
                  {Math.round(food.calories)} kcal
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                P{Math.round(food.protein)}g · C{Math.round(food.carbs)}g · F{Math.round(food.fat)}g
                {food.fiber ? ` · Fiber${Math.round(food.fiber)}g` : ''}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function DietPage() {
  const queryClient = useQueryClient();
  const [showSearch, setShowSearch] = useState(false);

  const { data: planRes, isLoading, isError: isPlanError } = useQuery({
    queryKey: ['dietPlan'],
    queryFn:  () => dietApi.getCurrent().then((r) => r.data),
  });

  // Backend wraps in { success, data }
  const plan = isPlanError ? null : (planRes?.data || planRes);

  const generateMutation = useMutation({
    mutationFn: dietApi.generate,
    onSuccess:  () => {
      toast.success('New diet plan generated!');
      queryClient.invalidateQueries({ queryKey: ['dietPlan'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to generate plan'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => dietApi.delete(plan._id),
    onSuccess:  () => {
      toast.success('Diet plan deleted');
      queryClient.invalidateQueries({ queryKey: ['dietPlan'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to delete plan'),
  });

  const addMealMutation = useMutation({
    mutationFn: ({ mealType, item }) =>
      dietApi.addCustomMeal({ meal_type: mealType, items: [item] }),
    onSuccess: () => {
      toast.success('Meal added!');
      setShowSearch(false);
      queryClient.invalidateQueries({ queryKey: ['dietPlan'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to add meal'),
  });

  // Compute real macro totals from actual plan data
  const computeMacros = (meals) => {
    if (!meals) return { protein: 0, carbs: 0, fat: 0, total: 0 };
    let protein = 0, carbs = 0, fat = 0;
    try {
      for (const day of Object.values(meals)) {
        if (typeof day === 'object' && day && day.meals) {
          for (const meal of Object.values(day.meals)) {
            protein += meal?.macros?.protein || 0;
            carbs   += meal?.macros?.carbs   || 0;
            fat     += meal?.macros?.fat     || 0;
          }
        }
      }
    } catch {
      // safely fallback on iterator failure
    }
    const total = protein + carbs + fat || 1;
    return {
      protein: Math.round((protein / total) * 100),
      carbs:   Math.round((carbs   / total) * 100),
      fat:     Math.round((fat     / total) * 100),
      total,
    };
  };

  const macros = plan ? computeMacros(plan.meals) : null;

  // plan.meals is an array of { day, meals: { breakfast, lunch, snack, dinner } }
  const mealDays = Array.isArray(plan?.meals) ? plan.meals : [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {showSearch && (
        <FoodSearchModal
          onClose={() => setShowSearch(false)}
          onAdd={(mealType, item) => addMealMutation.mutate({ mealType, item })}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Salad className="h-8 w-8 text-primary" /> Diet Planner
          </h1>
          <p className="text-muted-foreground mt-1">
            Personalized weekly meal plans based on your health profile.
          </p>
        </div>
        <div className="flex gap-2">
          {plan && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSearch(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" /> Add Meal
            </Button>
          )}
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="gap-2"
          >
            {generateMutation.isPending
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
              : <><Sparkles className="h-4 w-4" /> {plan ? 'Regenerate' : 'Generate Plan'}</>}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-32 col-span-full" />
          {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-80" />)}
        </div>
      ) : !plan ? (
        <Card className="border-dashed bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Salad className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold">No active diet plan</h3>
            <p className="text-muted-foreground mt-2 max-w-md mb-8 text-sm">
              Make sure your profile has weight, height, and age set, then generate your first plan.
            </p>
            <Button
              size="lg"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              <Sparkles className="h-4 w-4 mr-2" /> Generate My Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-primary-foreground/20 p-3 rounded-xl">
                  <Flame className="h-7 w-7 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wider">Daily Target</p>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-3xl font-extrabold">{plan.total_calories ?? 2000}</span>
                    <span className="text-sm text-primary-foreground/70">kcal</span>
                  </div>
                  {plan.goal && (
                    <p className="text-[11px] text-primary-foreground/60 capitalize mt-0.5">{plan.goal.replace('_', ' ')}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardContent className="p-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Average Macro Split
                </p>
                <div className="flex flex-wrap gap-8">
                  {[
                    { key: 'protein', label: 'Protein', color: 'bg-blue-500' },
                    { key: 'carbs',   label: 'Carbs',   color: 'bg-emerald-500' },
                    { key: 'fat',     label: 'Fats',    color: 'bg-amber-500' },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-bold text-lg">{macros?.[key] || 0}%</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Restriction warnings from plan */}
                {mealDays[0]?.restrictions?.length > 0 && (
                  <p className="text-xs text-amber-600 mt-3 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                    ⚠ Avoiding: {mealDays[0].restrictions.slice(0, 5).join(', ')}
                    {mealDays[0].restrictions.length > 5 && ` +${mealDays[0].restrictions.length - 5} more`}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xl font-bold">Weekly Schedule</h3>
            <button
              onClick={() => {
                if (window.confirm('Delete this diet plan?')) deleteMutation.mutate();
              }}
              className="flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete plan
            </button>
          </div>

          {/* Weekly grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {mealDays.map((dayPlan, i) => (
              <Card
                key={i}
                className={`overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
                  i === 0 ? 'ring-2 ring-primary ring-offset-2' : ''
                }`}
              >
                <div className={`py-2.5 px-4 font-bold text-sm text-center border-b tracking-wide ${
                  i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
                }`}>
                  {i === 0 ? '📍 ' : ''}{dayPlan.day}
                </div>
                <CardContent className="p-0 flex-1 flex flex-col divide-y">
                  {MEAL_TYPES.map(({ id, label, color }) => {
                    const meal = dayPlan.meals?.[id];
                    if (!meal) return null;
                    return (
                      <div key={id} className="p-3 hover:bg-muted/20 transition-colors">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${color} mb-1.5 inline-block`}>
                          {label}
                        </span>
                        <p className="font-medium text-sm leading-snug mb-2">{meal.name}</p>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-primary flex items-center gap-0.5">
                            <Flame className="h-3 w-3" /> {meal.calories}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            <span className="text-blue-600">P</span>{meal.macros?.protein}·
                            <span className="text-emerald-600">C</span>{meal.macros?.carbs}·
                            <span className="text-amber-600">F</span>{meal.macros?.fat}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}