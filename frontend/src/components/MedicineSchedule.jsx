import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { medicineApi } from '../api/medicine.api';
import { format } from 'date-fns';
import { Check, X } from 'lucide-react';
export const MedicineSchedule = () => {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading
  } = useQuery({
    queryKey: ['todaySchedule'],
    queryFn: medicineApi.getToday
  });
  const {
    mutate
  } = useMutation({
    mutationFn: medicineApi.logDose,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['todaySchedule']
      });
    }
  });
  if (isLoading) return <div>Loading schedule...</div>;
  const schedule = data?.data || [];
  return <div className="space-y-4">
      <h2 className="text-xl font-serif font-bold">Today's Schedule</h2>
      {schedule.length === 0 ? <p className="text-muted-foreground">No medicines scheduled for today.</p> : <div className="flex gap-4 overflow-x-auto pb-4">
          {schedule.map((item, idx) => <div key={idx} className={`min-w-[250px] border p-4 rounded-xl flex flex-col gap-2 
              ${item.status === 'taken' ? 'bg-primary/10 border-primary/20' : item.status === 'skipped' ? 'bg-destructive/10 border-destructive/20' : 'bg-card shadow-sm border-border'}`}>
              <div className="flex justify-between items-start">
                <span className="font-mono text-sm font-semibold opacity-70">
                  {format(new Date(item.scheduled_at), 'hh:mm a')}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border
                  ${item.status === 'taken' ? 'text-primary border-primary bg-primary/10' : item.status === 'skipped' ? 'text-destructive border-destructive bg-destructive/10' : 'text-muted-foreground border-border bg-secondary'}
                `}>
                  {item.status.toUpperCase()}
                </span>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg">{item.medicine.name}</h3>
                <p className="text-sm opacity-80">{item.medicine.dosage} {item.medicine.unit}</p>
                {item.medicine.food_instruction && <p className="text-xs mt-1 bg-secondary text-secondary-foreground inline-block px-2 py-1 rounded">
                    {item.medicine.food_instruction} food
                  </p>}
              </div>

              <div className="mt-4 flex gap-2">
                <button onClick={() => mutate({
            medicine_id: item.medicine._id,
            scheduled_at: item.scheduled_at,
            status: 'taken'
          })} disabled={item.status === 'taken'} className="flex-1 bg-primary text-primary-foreground text-xs py-2 rounded-lg font-semibold flex items-center justify-center gap-1 disabled:opacity-50" aria-label="Mark as taken">
                  <Check size={14} /> Taken
                </button>
                <button onClick={() => mutate({
            medicine_id: item.medicine._id,
            scheduled_at: item.scheduled_at,
            status: 'skipped'
          })} disabled={item.status === 'skipped'} className="flex-1 bg-destructive/90 text-destructive-foreground text-xs py-2 rounded-lg font-semibold flex items-center justify-center gap-1 disabled:opacity-50" aria-label="Mark as skipped">
                  <X size={14} /> Skip
                </button>
              </div>
            </div>)}
        </div>}
    </div>;
};