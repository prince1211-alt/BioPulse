import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { medicineApi } from '../api/medicine.api';
import { MedicineSchedule } from '../components/MedicineSchedule';
import { AddMedicineForm } from '../components/AddMedicineForm';
export const MedicinesPage = () => {
  const [showAdd, setShowAdd] = useState(false);
  const {
    data,
    isLoading
  } = useQuery({
    queryKey: ['medicines'],
    queryFn: medicineApi.getAll
  });
  const medicines = data?.data || [];
  return <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Medicine Routine</h1>
          <p className="text-muted-foreground">Keep track of your daily doses and schedules.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-accent text-accent-foreground px-4 py-2 rounded-lg font-bold hover:bg-accent/90">
          {showAdd ? 'Cancel' : '+ Add Medicine'}
        </button>
      </div>

      {showAdd && <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Add New Medicine</h2>
          <AddMedicineForm onSuccess={() => setShowAdd(false)} />
        </div>}

      <MedicineSchedule />

      <div className="space-y-4 pt-8 border-t">
        <h2 className="text-xl font-serif font-bold">Active Medicines</h2>
        {isLoading ? <p>Loading...</p> : medicines.length === 0 ? <p className="text-muted-foreground">You don't have any active medicines.</p> : <div className="grid md:grid-cols-2 gap-4">
            {medicines.map(med => <div key={med._id} className="p-4 border rounded-xl bg-card">
                <div className="flex justify-between">
                  <h3 className="font-bold text-lg">{med.name}</h3>
                  <span className="text-sm font-mono text-muted-foreground">{med.days_supply ? `${med.days_supply} days left` : 'Ongoing'}</span>
                </div>
                <p className="opacity-80 mt-1">{med.dosage} {med.unit} • {med.frequency}</p>
                <div className="mt-2 text-sm text-primary font-mono bg-primary/10 inline-block px-2 py-0.5 rounded">
                  {med.times.join(', ')} {med.food_instruction && `• ${med.food_instruction} food`}
                </div>
              </div>)}
          </div>}
      </div>
    </div>;
};