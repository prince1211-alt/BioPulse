import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dietApi } from '../api/diet.api';
export const DietPage = () => {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading
  } = useQuery({
    queryKey: ['dietPlan'],
    queryFn: dietApi.getCurrent
  });
  const {
    mutate,
    isPending
  } = useMutation({
    mutationFn: dietApi.generate,
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['dietPlan']
    })
  });
  const plan = data?.data;
  return <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Diet Scheduler</h1>
          <p className="text-muted-foreground">AI-generated weekly meal plans tailored to your health.</p>
        </div>
        <button onClick={() => mutate()} disabled={isPending} className="bg-accent text-accent-foreground px-4 py-2 rounded-lg font-bold disabled:opacity-50">
          {isPending ? 'Generating...' : 'Generate AI Plan'}
        </button>
      </div>

      {isLoading ? <p>Loading...</p> : !plan ? <div className="text-center p-12 bg-card border rounded-xl">
          <p className="text-muted-foreground mb-4">You do not have a meal plan yet.</p>
          <button onClick={() => mutate()} disabled={isPending} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold">
            Create Weekly Plan 
          </button>
        </div> : <div className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex gap-8">
            <div>
              <p className="text-sm font-semibold opacity-70">Daily Target</p>
              <p className="text-xl font-bold font-mono">{plan.total_calories} kcal</p>
            </div>
            {plan.ai_generated && <div className="ml-auto bg-accent/10 border border-accent text-accent px-3 py-1 flex items-center rounded-full text-xs font-bold">
                ✨ AI Tailored
              </div>}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plan.meals?.map((dayPlan, i) => <div key={i} className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="bg-secondary p-3 font-serif font-bold text-center border-b text-sm">
                  {dayPlan.day}
                </div>
                <div className="p-4 space-y-4">
                  {['breakfast', 'lunch', 'snack', 'dinner'].map(type => {
              const meal = dayPlan.meals[type];
              if (!meal) return null;
              return <div key={type} className="border-b last:border-0 pb-3 last:pb-0">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{type}</p>
                        <p className="font-semibold text-sm mt-1">{meal.name}</p>
                        <div className="flex justify-between mt-1 opacity-70 text-xs font-mono">
                          <span>{meal.calories} kcal</span>
                          <span>P:{meal.macros?.protein} C:{meal.macros?.carbs} F:{meal.macros?.fat}</span>
                        </div>
                      </div>;
            })}
                </div>
              </div>)}
          </div>
        </div>}
    </div>;
};