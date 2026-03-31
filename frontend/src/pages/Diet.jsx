import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Salad, Flame, Activity, Sparkles, Utensils, RefreshCw, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { dietApi } from '../api/diet.api';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

export function DietPage() {
  const queryClient = useQueryClient();

  const { data: planData, isLoading } = useQuery({
    queryKey: ['dietPlan'],
    queryFn: dietApi.getCurrent
  });

  const generateMutation = useMutation({
    mutationFn: dietApi.generate,
    onSuccess: () => {
      toast.success('AI Weekly Diet Plan generated successfully!');
      queryClient.invalidateQueries({ queryKey: ['dietPlan'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to generate diet plan');
    }
  });

  // Extract from interceptor response
  const plan = planData?.data || planData;

  const mealTypes = [
    { id: 'breakfast', label: 'Breakfast', color: 'bg-amber-100 text-amber-800' },
    { id: 'lunch', label: 'Lunch', color: 'bg-emerald-100 text-emerald-800' },
    { id: 'snack', label: 'Snack', color: 'bg-purple-100 text-purple-800' },
    { id: 'dinner', label: 'Dinner', color: 'bg-blue-100 text-blue-800' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            AI Diet Scheduler
          </h1>
          <p className="text-muted-foreground mt-1">
            Personalized weekly meal plans tailored to your latest lab reports.
          </p>
        </div>
        
        <Button 
          onClick={() => generateMutation.mutate()} 
          disabled={generateMutation.isPending}
          className="gap-2 shadow-soft pl-3"
        >
          {generateMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
             <Sparkles className="h-4 w-4" />
          )}
          {generateMutation.isPending ? 'Generating...' : 'Regenerate Plan'}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Skeleton className="h-40 w-full col-span-full" />
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-96 w-full" />
          ))}
        </div>
      ) : !plan ? (
        <Card className="border-dashed bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Salad className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-foreground">No active diet plan</h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto mb-8">
              Let our AI analyze your health data and create a specialized diet plan mathematically optimized for your body.
            </p>
            <Button 
              size="lg" 
              onClick={() => generateMutation.mutate()} 
              disabled={generateMutation.isPending}
              className="px-8 shadow-soft"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate First Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Target Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-primary text-primary-foreground shadow-soft border-primary">
              <CardContent className="p-6 flex items-center gap-6">
                 <div className="bg-primary-foreground/20 p-4 rounded-xl shrink-0">
                    <Flame className="h-8 w-8 text-primary-foreground" />
                 </div>
                 <div>
                    <p className="text-primary-foreground/80 text-sm font-semibold uppercase tracking-wider mb-1">
                      Daily Target
                    </p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-extrabold tracking-tight">{plan.total_calories || 2000}</span>
                      <span className="text-primary-foreground/80 font-medium font-mono text-sm leading-none">kcal</span>
                    </div>
                 </div>
                 {plan.ai_generated && (
                   <div className="ml-auto bg-primary-foreground/20 text-primary-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                     <Sparkles className="h-3 w-3" />
                     AI Opt
                   </div>
                 )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2 shadow-soft">
              <CardContent className="p-6 flex flex-col justify-center h-full">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Macros Breakdown Average
                </p>
                <div className="flex flex-wrap items-center gap-6 lg:gap-12">
                   <div className="flex items-center gap-3">
                     <div className="bg-blue-100 text-blue-600 p-2 rounded-lg"><Activity className="h-5 w-5" /></div>
                     <div>
                       <p className="text-xs text-muted-foreground font-medium">Protein</p>
                       <p className="font-bold text-xl">30%</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg"><Activity className="h-5 w-5" /></div>
                     <div>
                       <p className="text-xs text-muted-foreground font-medium">Carbs</p>
                       <p className="font-bold text-xl">45%</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="bg-amber-100 text-amber-600 p-2 rounded-lg"><Activity className="h-5 w-5" /></div>
                     <div>
                       <p className="text-xs text-muted-foreground font-medium">Fats</p>
                       <p className="font-bold text-xl">25%</p>
                     </div>
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <h3 className="text-xl font-bold border-b pb-2 pt-2">Your Weekly Schedule</h3>

          {/* Weekly Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {plan.meals?.map((dayPlan, i) => (
              <Card key={i} className={`overflow-hidden flex flex-col shadow-soft transition-all hover:shadow-md ${i === 0 ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                <div className={`py-3 px-4 font-bold text-center border-b tracking-wide ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground'}`}>
                  {i === 0 ? 'Today ' : ''}{dayPlan.day}
                </div>
                
                <CardContent className="p-0 flex-1 flex flex-col divide-y">
                  {mealTypes.map(type => {
                    const meal = dayPlan.meals[type.id];
                    if (!meal) return null;
                    
                    return (
                      <div key={type.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col h-full">
                        <span className={`text-[10px] w-fit font-bold uppercase tracking-wider px-2 py-0.5 rounded ${type.color} mb-2`}>
                          {type.label}
                        </span>
                        
                        <p className="font-semibold text-sm mb-2 flex-grow text-foreground">
                          {meal.name}
                        </p>
                        
                        <div className="mt-auto">
                          <div className="flex justify-between items-end border-t border-border/50 pt-2 mt-2">
                             <div className="flex items-center gap-1 text-primary font-mono text-xs font-bold">
                               <Flame className="h-3 w-3" />
                               {meal.calories} cal
                             </div>
                             <div className="text-[10px] text-muted-foreground font-mono space-x-1.5 flex bg-muted/40 px-1.5 py-0.5 rounded">
                               <span><span className="text-blue-600 font-bold">P</span>{meal.macros?.protein}</span>
                               <span><span className="text-emerald-600 font-bold">C</span>{meal.macros?.carbs}</span>
                               <span><span className="text-amber-600 font-bold">F</span>{meal.macros?.fat}</span>
                             </div>
                          </div>
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