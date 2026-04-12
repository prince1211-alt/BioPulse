import { create } from 'zustand';

export const useMedicineStore = create((set, get) => ({
  todaySchedule:  [],
  adherenceStats: null,

  setTodaySchedule: (schedule) => set({ todaySchedule: schedule }),
  setAdherenceStats: (stats) => set({ adherenceStats: stats }),

  // Optimistic update — mark a dose immediately while the API call is in flight
  optimisticLogDose: (medicineId, scheduledAt, status) =>
    set((state) => ({
      todaySchedule: state.todaySchedule.map((item) =>
        item.medicine._id === medicineId &&
        new Date(item.scheduled_at).getTime() === new Date(scheduledAt).getTime()
          ? { ...item, status }
          : item
      ),
    })),

  // Rollback optimistic update on API failure
  rollbackLogDose: (medicineId, scheduledAt, previousStatus) =>
    set((state) => ({
      todaySchedule: state.todaySchedule.map((item) =>
        item.medicine._id === medicineId &&
        new Date(item.scheduled_at).getTime() === new Date(scheduledAt).getTime()
          ? { ...item, status: previousStatus }
          : item
      ),
    })),

  pendingCount: () =>
    get().todaySchedule.filter((i) => i.status === 'pending').length,

  takenToday: () =>
    get().todaySchedule.filter((i) => i.status === 'taken').length,
}));