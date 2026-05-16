import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Salad, Flame, Sparkles, RefreshCw, Plus, Search, X,
  AlertTriangle, ChevronDown, Utensils, Droplets, ShieldAlert,
  ChevronRight, BarChart3, Info
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { toast } from 'sonner';
import { dietApi } from '../api/diet.api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🌅', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  { id: 'lunch',     label: 'Lunch',     emoji: '☀️', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { id: 'snack',     label: 'Snack',     emoji: '🥜', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  { id: 'dinner',    label: 'Dinner',    emoji: '🌙', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
];

const PATIENT_TYPES = [
  { value: 'general',      label: 'General' },
  { value: 'diabetic',     label: 'Diabetic' },
  { value: 'hypertensive', label: 'Hypertensive' },
  { value: 'renal',        label: 'Renal / Kidney' },
];

// ── Progress Ring Component ───────────────────────────────────────────────────
function ProgressRing({ value, max, color, size = 60, strokeWidth = 6, children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference - percent * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="text-muted/20 dark:text-muted/10"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Add Food Modal (Manual Entry + Search tabs) ───────────────────────────────
function FoodSearchModal({ onClose, onAdd, isAdding }) {
  const [tab, setTab]           = useState('manual');
  const [mealType, setMealType] = useState('breakfast');
  // manual form
  const [form, setForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', notes: '' });
  const [formErr, setFormErr]   = useState('');
  // search
  const [q, setQ] = useState('');

  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: ['foodSearch', q],
    queryFn:  () => dietApi.searchFoods(q).then((r) => r.data?.data || r.data || []),
    enabled:  tab === 'search' && q.length >= 2,
  });
  const foods = Array.isArray(searchData) ? searchData : [];

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleManualAdd = () => {
    if (!form.name.trim()) { setFormErr('Food name is required.'); return; }
    if (!form.calories || isNaN(Number(form.calories)) || Number(form.calories) <= 0) {
      setFormErr('Enter a valid calorie amount.'); return;
    }
    setFormErr('');
    onAdd(mealType, {
      name:     form.name.trim(),
      calories: Number(form.calories),
      macros: {
        protein: Number(form.protein) || 0,
        carbs:   Number(form.carbs)   || 0,
        fat:     Number(form.fat)     || 0,
      },
      notes: form.notes.trim() || undefined,
    });
  };

  const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add Food to Plan
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Meal type selector */}
        <div className="px-5 pt-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Meal Type</label>
          <select value={mealType} onChange={(e) => setMealType(e.target.value)} className={inputCls}>
            {MEAL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4">
          {[['manual','✏️ Enter Manually'], ['search','🔍 Search Database']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* Manual tab */}
        {tab === 'manual' && (
          <div className="p-5 space-y-3 overflow-y-auto flex-1">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Food Name *</label>
              <Input placeholder="e.g. Dal Tadka, Brown Rice, Apple" value={form.name} onChange={(e) => setF('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Calories (kcal) *</label>
              <Input type="number" placeholder="e.g. 350" value={form.calories} onChange={(e) => setF('calories', e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Protein (g)</label>
                <Input type="number" placeholder="0" value={form.protein} onChange={(e) => setF('protein', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Carbs (g)</label>
                <Input type="number" placeholder="0" value={form.carbs} onChange={(e) => setF('carbs', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Fat (g)</label>
                <Input type="number" placeholder="0" value={form.fat} onChange={(e) => setF('fat', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes / Instructions (optional)</label>
              <Input placeholder="e.g. No salt, steamed" value={form.notes} onChange={(e) => setF('notes', e.target.value)} />
            </div>
            {formErr && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{formErr}</p>}
            <Button onClick={handleManualAdd} disabled={isAdding} className="w-full gap-2 mt-1">
              {isAdding ? <><RefreshCw className="h-4 w-4 animate-spin" /> Adding…</> : <><Plus className="h-4 w-4" /> Add to {mealType}</>}
            </Button>
          </div>
        )}

        {/* Search tab */}
        {tab === 'search' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search (e.g. apple, rice, chicken)…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {searching && <p className="text-sm text-muted-foreground text-center py-6">Searching…</p>}
              {!searching && q.length >= 2 && foods.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No results. Try entering manually.</p>
              )}
              {!q && <p className="text-sm text-muted-foreground text-center py-8">Type to search the food database</p>}
              {foods.map((food) => (
                <button key={food.id}
                  onClick={() => onAdd(mealType, { name: food.name, calories: food.calories, macros: { protein: food.protein, carbs: food.carbs, fat: food.fat } })}
                  className="w-full text-left p-3 rounded-lg border hover:bg-primary/5 hover:border-primary/30 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm">{food.name}</p>
                      {food.brand && <p className="text-xs text-muted-foreground">{food.brand}</p>}
                    </div>
                    <span className="text-xs font-bold text-primary ml-3 shrink-0 bg-primary/10 px-2 py-1 rounded-full">
                      {Math.round(food.calories)} kcal
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                    P{Math.round(food.protein)}g · C{Math.round(food.carbs)}g · F{Math.round(food.fat)}g
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── AI Diet Chatbot ─────────────────────────────────────────────────────────────
function DietChatbot({ patientType, setPatientType }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const chatMutation = useMutation({
    mutationFn: (data) => dietApi.chat(data).then(r => r.data),
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: 'assistant', content: data.data.reply }]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to get a response');
    }
  });

  const handleSend = (val) => {
    const text = typeof val === 'string' ? val : input;
    if (!text.trim() || chatMutation.isPending) return;

    const userMessage = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMessage]);
    if (typeof val !== 'string') setInput('');

    chatMutation.mutate({
      message: userMessage.content,
      patient_type: patientType,
      history: messages
    });
  };

  const suggestions = [
    "High protein meals",
    "Low sodium lunch",
    "Weight loss snacks",
    "Mediterranean diet"
  ];

  return (
    <Card className="border shadow-sm h-[520px] flex flex-col bg-card overflow-hidden">
      <div className="p-4 border-b flex justify-between items-center bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">Diet Assistant Chat</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">AI RECOMMENDATION ENGINE</p>
          </div>
        </div>
        <select
          value={patientType}
          onChange={(e) => {
            setPatientType(e.target.value);
            setMessages([]);
          }}
          className="h-7 rounded-md border bg-background px-2 text-[10px] font-semibold outline-none"
        >
          {PATIENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center mb-4">
              <Utensils className="h-6 w-6 text-primary/40" />
            </div>
            <p className="text-sm font-semibold text-foreground/80">I am your virtual Dietitian.</p>
            <p className="text-xs text-muted-foreground mt-1 mb-6">Ask me anything about your {PATIENT_TYPES.find(p => p.value === patientType)?.label} diet!</p>
            
            <div className="grid grid-cols-2 gap-2 w-full">
              {suggestions.map(s => (
                <button 
                  key={s} 
                  onClick={() => handleSend(s)}
                  className="p-2 text-[10px] border rounded-lg hover:bg-primary/5 hover:border-primary/30 transition-all text-left flex items-center justify-between group"
                >
                  <span className="truncate">{s}</span>
                  <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs ${
                m.role === 'user' 
                  ? 'bg-primary text-primary-foreground rounded-tr-none' 
                  : 'bg-muted rounded-tl-none border shadow-sm'
              }`}>
                {m.content.split('\n').map((line, idx) => (
                  <p key={idx} className={`${line.trim().startsWith('-') || line.trim().startsWith('*') ? 'ml-4' : ''} ${line.trim() === '' ? 'h-2' : ''}`}>
                    {line.replace(/\*\*(.*?)\*\*/g, '$1')}
                  </p>
                ))}
              </div>
            </div>
          ))
        )}
        {chatMutation.isPending && (
          <div className="flex justify-start">
             <div className="bg-muted rounded-2xl rounded-tl-none px-3 py-2 border shadow-sm flex items-center gap-2">
                <div className="flex gap-1">
                   <div className="h-1 w-1 bg-primary/40 rounded-full animate-bounce" />
                   <div className="h-1 w-1 bg-primary/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                   <div className="h-1 w-1 bg-primary/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span className="text-[10px] text-muted-foreground">AI is thinking...</span>
             </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-muted/5">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <Input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="h-9 text-xs focus-visible:ring-1"
            disabled={chatMutation.isPending}
          />
          <Button type="submit" disabled={!input.trim() || chatMutation.isPending} size="sm" className="h-9 px-3">
             <Plus className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}

// ── Recommendations Panel ────────────────────────────────────────────────────
function RecommendationsPanel({ recs, onAdd, addingMealType }) {
  const [expanded, setExpanded] = useState(true);
  if (!recs) return null;

  return (
    <Card className="border border-dashed">
      <CardContent className="p-5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 mb-1"
        >
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-primary" />
            <div className="text-left">
              <p className="font-bold text-sm capitalize">{recs.label} Diet Recommendations</p>
              <p className="text-xs text-muted-foreground">{recs.note}</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div className="mt-4 space-y-4">
            {MEAL_TYPES.map((m) => {
              const foods = recs[m.id] || [];
              if (!foods.length) return null;
              return (
                <div key={m.id}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${m.color} inline-block mb-2`}>
                    {m.emoji} {m.label}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {foods.map((food, idx) => (
                      <button
                        key={`${m.id}-${idx}`}
                        onClick={() => onAdd(m.id, food)}
                        disabled={addingMealType === m.id}
                        className="rounded-full border px-3 py-1.5 text-xs hover:bg-primary/5 hover:border-primary/40 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" />
                        {food.name}
                        <span className="text-muted-foreground">· {Math.round(food.calories)} kcal</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {recs.avoidKeywords?.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2.5 flex items-start gap-2 mt-2">
                <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-destructive mb-1">Foods to Avoid</p>
                  <p className="text-xs text-muted-foreground">{recs.avoidKeywords.join(', ')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Weekly Trends Chart ───────────────────────────────────────────────────────
function WeeklyNutritionTrends({ history }) {
  const data = history || [];

  return (
    <Card className="border shadow-sm">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <p className="font-bold text-sm">Weekly Calorie Trends</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>Last 7 days</span>
        </div>
      </div>
      <CardContent className="p-4 pt-6">
        <div className="h-[180px] w-full">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#888' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#888' }}
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px' }}
                />
                <Bar dataKey="kcal" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.kcal > 2500 ? '#f87171' : '#10b981'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground bg-muted/5 rounded-lg border border-dashed">
              <BarChart3 className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm font-semibold">No data available yet</p>
              <p className="text-[10px]">Log meals for a few days to see trends.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Today's Food Log ─────────────────────────────────────────────────────────
function TodayFoodLog({ dayPlan, onAddFood, onRemoveFood }) {
  const meals = dayPlan?.meals || {};

  return (
    <Card className="border shadow-sm overflow-hidden bg-card">
      <div className="py-3 px-4 font-bold text-sm border-b bg-muted/10 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          <span>Today's Food Log</span>
        </div>
      </div>
      <CardContent className="p-0 flex flex-col divide-y divide-border/50">
        {MEAL_TYPES.map(({ id, label, color, emoji }) => {
          const mealItems = Array.isArray(meals[id]) ? meals[id] : [];
          const mealCalories = mealItems.reduce((sum, item) => sum + (item.calories || 0), 0);
          const isOverLimit = mealCalories > 2000;

          return (
            <div key={id} className="p-4 hover:bg-muted/5 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${color} inline-flex items-center gap-1`}>
                    {emoji} {label}
                  </span>
                  {isOverLimit && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded animate-pulse">
                      <AlertTriangle className="h-3 w-3" /> High Calorie
                    </span>
                  )}
                  {mealCalories > 0 && (
                    <span className="text-[10px] font-semibold text-muted-foreground ml-2">
                      {Math.round(mealCalories)} kcal total
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 border hover:bg-primary/5" onClick={() => onAddFood(id)}>
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              
              {mealItems.length > 0 ? (
                <div className="space-y-3">
                  {mealItems.map((item, idx) => (
                    <div key={item._id || idx} className="flex justify-between items-start group">
                      <div>
                        <p className="font-semibold text-sm text-foreground/90 leading-tight mb-1">
                          {item.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                            <Flame className="h-3 w-3" /> {Math.round(item.calories)} kcal
                          </span>
                          <div className="flex gap-1.5">
                            <span className="text-[9px] text-muted-foreground bg-blue-500/5 text-blue-600 border border-blue-200/50 px-1 rounded font-medium">
                              P {Math.round(item.macros?.protein || 0)}g
                            </span>
                            <span className="text-[9px] text-muted-foreground bg-emerald-500/5 text-emerald-600 border border-emerald-200/50 px-1 rounded font-medium">
                              C {Math.round(item.macros?.carbs || 0)}g
                            </span>
                            <span className="text-[9px] text-muted-foreground bg-amber-500/5 text-amber-600 border border-amber-200/50 px-1 rounded font-medium">
                              F {Math.round(item.macros?.fat || 0)}g
                            </span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => onRemoveFood(id, item._id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                        title="Remove item"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic py-1">No foods added yet.</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function DietPage() {
  const queryClient              = useQueryClient();
  const [showSearch, setShowSearch] = useState(false);
  const [addingType, setAddingType] = useState(null);
  const [chatPatientType, setChatPatientType] = useState('general');
  const [hydration, setHydration] = useState(0);

  // Active diet plan (enriched with auto_recommendations)
  const { data: planRes, isLoading } = useQuery({
    queryKey: ['dietPlan'],
    queryFn:  () => dietApi.getCurrent().then((r) => r.data),
  });

  // Standalone recommendations (always shown)
  const { data: recsRes } = useQuery({
    queryKey: ['dietRecommendations'],
    queryFn:  () => dietApi.getRecommendations().then((r) => r.data?.data || r.data),
  });

  const plan     = planRes?.data || planRes;
  const mealDays = Array.isArray(plan?.meals) ? plan.meals : [];
  const recs     = plan?.auto_recommendations || recsRes?.recommendations;

  // ── Mutations ───────────────────────────────────────────────────────────────

  const addMealMutation = useMutation({
    mutationFn: ({ mealType, item }) => {
      setAddingType(mealType);
      return dietApi.addCustomMeal({ meal_type: mealType, items: [item] });
    },
    onSuccess: (res) => {
      const warnings = res.data?.data?.manual_warnings || res.data?.manual_warnings;
      if (warnings?.length) {
        warnings.forEach((w) => toast.warning(w));
      } else {
        toast.success('Food added to today\'s plan!');
      }
      setShowSearch(false);
      setAddingType(null);
      queryClient.invalidateQueries({ queryKey: ['dietPlan'] });
    },
    onError: (err) => {
      setAddingType(null);
      toast.error(err.response?.data?.message || 'Failed to add food');
    },
  });

  const removeMealMutation = useMutation({
    mutationFn: ({ mealType, itemId }) => dietApi.removeCustomMeal(mealType, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dietPlan'] });
      toast.success('Food removed');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove food')
  });

  const handleAdd = (mealType, item) => {
    addMealMutation.mutate({ mealType, item });
  };

  const handleRemove = (mealType, itemId) => {
    removeMealMutation.mutate({ mealType, itemId });
  };

  const handleOpenSearch = (mealType = 'breakfast') => {
    // If we want to set default meal type in modal, we'd need to lift that state up or pass it
    // For now we just show the modal. The modal state handles meal type internally, but we can update FoodSearchModal if needed.
    setShowSearch(true);
  };

  // ── Macro stats ─────────────────────────────────────────────────────────────
  const macros = (() => {
    let p = 0, c = 0, f = 0, calories = 0;
    const todayMeals = mealDays[0]?.meals || {};
    for (const mealItems of Object.values(todayMeals)) {
      if (Array.isArray(mealItems)) {
        for (const item of mealItems) {
          p += item.macros?.protein || 0;
          c += item.macros?.carbs   || 0;
          f += item.macros?.fat     || 0;
          calories += item.calories || 0;
        }
      }
    }
    const total = p + c + f || 1;
    return {
      totalCalories: calories,
      protein: Math.round((p / total) * 100),
      carbs:   Math.round((c / total) * 100),
      fat:     Math.round((f / total) * 100),
    };
  })();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {showSearch && (
        <FoodSearchModal
          onClose={() => setShowSearch(false)}
          onAdd={handleAdd}
          isAdding={addMealMutation.isPending}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground/90">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Salad className="h-6 w-6 text-primary" />
            </div>
            Diet Planner
          </h1>
          <p className="text-muted-foreground mt-1 text-xs font-medium">
            Personalized clinical nutrition tracking and AI assistance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSearch(true)}
            className="h-9 px-4 gap-2 border shadow-sm hover:bg-muted/50"
          >
            <Plus className="h-4 w-4 text-primary" /> Add Food
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-28 col-span-full" />
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Stats bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className={`border shadow-sm ${macros.totalCalories > 5000 ? 'bg-destructive/5 border-destructive/20' : 'bg-primary text-primary-foreground'}`}>
                <CardContent className="p-5 flex items-center gap-4">
                  <ProgressRing 
                    value={macros.totalCalories} 
                    max={plan?.total_calories ?? 2000} 
                    color={macros.totalCalories > 5000 ? "text-destructive" : "text-primary-foreground"} 
                    size={64} 
                    strokeWidth={5}
                  >
                    <Flame className={`h-6 w-6 ${macros.totalCalories > 5000 ? 'text-destructive' : 'text-primary-foreground'}`} />
                  </ProgressRing>
                  <div className="flex-1">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${macros.totalCalories > 5000 ? 'text-destructive' : 'text-primary-foreground/70'}`}>
                      Today's Intake
                    </p>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className={`text-2xl font-bold ${macros.totalCalories > 5000 ? 'text-destructive' : ''}`}>{Math.round(macros.totalCalories)}</span>
                      <span className={`text-xs ${macros.totalCalories > 5000 ? 'text-destructive/70' : 'text-primary-foreground/70'}`}>
                        / {plan?.total_calories ?? 2000} kcal
                      </span>
                    </div>
                    {macros.totalCalories > 5000 && (
                      <p className="text-[9px] font-bold text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" /> LIMIT EXCEEDED
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardContent className="p-5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Today's Macros</p>
                  <div className="flex gap-4 justify-between">
                    {[
                      { key: 'protein', label: 'Pro', color: 'text-blue-500' },
                      { key: 'carbs',   label: 'Carb',  color: 'text-emerald-500' },
                      { key: 'fat',     label: 'Fat',    color: 'text-amber-500' },
                    ].map(({ key, label, color }) => (
                      <div key={key} className="flex flex-col items-center gap-1">
                        <ProgressRing 
                          value={macros?.[key] || 0} 
                          max={100} 
                          color={color} 
                          size={40} 
                          strokeWidth={4}
                        >
                          <span className="text-[10px] font-bold">{macros?.[key] || 0}%</span>
                        </ProgressRing>
                        <p className="text-[9px] text-muted-foreground font-semibold uppercase">{label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border shadow-sm overflow-hidden relative">
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Droplets className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hydration</p>
                    <div className="flex items-center justify-between mt-1">
                       <p className="font-bold text-xs">{hydration} / 8 glasses</p>
                       <div className="flex gap-1 items-center bg-muted/30 rounded-full px-1 py-0.5">
                          <button 
                            onClick={() => setHydration(Math.max(0, hydration - 1))}
                            className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-muted/80 text-[10px] font-bold"
                          >-</button>
                          <div className="flex gap-0.5 px-1">
                            {[...Array(8)].map((_, i) => (
                               <div key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i < hydration ? 'bg-blue-500' : 'bg-muted-foreground/20'}`} />
                            ))}
                          </div>
                          <button 
                            onClick={() => setHydration(Math.min(8, hydration + 1))}
                            className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-muted/80 text-[10px] font-bold"
                          >+</button>
                       </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Today's Food Log */}
            <TodayFoodLog 
              dayPlan={mealDays[0] || {}} 
              onAddFood={handleOpenSearch} 
              onRemoveFood={handleRemove}
            />

            <WeeklyNutritionTrends history={plan?.history} />

            {/* Auto recommendations */}
            <RecommendationsPanel
              recs={recs}
              onAdd={handleAdd}
              addingMealType={addingType}
            />
          </div>

          <div className="lg:col-span-1">
            {/* AI Chatbot */}
            <DietChatbot 
              patientType={chatPatientType}
              setPatientType={setChatPatientType}
            />
          </div>
        </div>
      )}
    </div>
  );
}