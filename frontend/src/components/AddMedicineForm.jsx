import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { medicineApi } from '../api/medicine.api';
const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  dosage: z.number().min(0.1),
  unit: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'custom']),
  times: z.string(),
  // comma separated for simple UI
  food_instruction: z.enum(['before', 'after', 'with']).optional(),
  start_date: z.string(),
  days_supply: z.number().optional()
});
export const AddMedicineForm = ({
  onSuccess
}) => {
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      frequency: 'daily',
      times: '08:00',
      start_date: new Date().toISOString().split('T')[0]
    }
  });
  const {
    mutate,
    isPending
  } = useMutation({
    mutationFn: medicineApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['todaySchedule']
      });
      queryClient.invalidateQueries({
        queryKey: ['medicines']
      });
      if (onSuccess) onSuccess();
    }
  });
  const onSubmit = values => {
    const timesArray = values.times.split(',').map(t => t.trim());
    mutate({
      ...values,
      start_date: new Date(values.start_date).toISOString(),
      times: timesArray
    });
  };
  return <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1 block">
          <span className="text-sm font-semibold">Medicine Name</span>
          <input className="w-full border rounded-md p-2 bg-background" {...form.register('name')} />
          {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
        </label>
        
        <div className="flex gap-2">
          <label className="space-y-1 block flex-1">
            <span className="text-sm font-semibold">Dosage</span>
            <input type="number" step="0.1" className="w-full border rounded-md p-2 bg-background" {...form.register('dosage', {
            valueAsNumber: true
          })} />
          </label>
          <label className="space-y-1 block w-20">
            <span className="text-sm font-semibold">Unit</span>
            <input className="w-full border rounded-md p-2 bg-background" {...form.register('unit')} placeholder="mg" />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1 block">
          <span className="text-sm font-semibold">Frequency</span>
          <select className="w-full border rounded-md p-2 bg-background" {...form.register('frequency')}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        
        <label className="space-y-1 block">
          <span className="text-sm font-semibold">Times (HH:MM, comma separated)</span>
          <input className="w-full border rounded-md p-2 bg-background" {...form.register('times')} placeholder="08:00, 20:00" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1 block">
          <span className="text-sm font-semibold">Food Instruction</span>
          <select className="w-full border rounded-md p-2 bg-background" {...form.register('food_instruction')}>
            <option value="">None</option>
            <option value="before">Before Food</option>
            <option value="after">After Food</option>
            <option value="with">With Food</option>
          </select>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-semibold">Start Date</span>
          <input type="date" className="w-full border rounded-md p-2 bg-background" {...form.register('start_date')} />
        </label>
      </div>

      <button type="submit" disabled={isPending} className="w-full bg-primary text-primary-foreground py-2 font-bold rounded-lg hover:bg-primary/90">
        {isPending ? 'Adding...' : 'Add Medicine'}
      </button>
    </form>;
};