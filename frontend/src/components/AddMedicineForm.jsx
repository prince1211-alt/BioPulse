import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { medicineApi } from "../api/medicine.api";

/* -------------------- Schema -------------------- */
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  dosage: z.number().min(0.1, "Dosage must be greater than 0"),
  unit: z.string().min(1, "Unit is required"),
  frequency: z.enum(["daily", "weekly", "custom"]),
  times: z.string(),
  food_instruction: z.enum(["before", "after", "with"]).optional(),
  start_date: z.string(),
  days_supply: z.number().optional(),
});

/* -------------------- Component -------------------- */
export const AddMedicineForm = ({ onSuccess }) => {
  const queryClient = useQueryClient();

  /* -------- Form Setup -------- */
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      frequency: "daily",
      times: "08:00",
      start_date: new Date().toISOString().split("T")[0],
    },
  });

  /* -------- API Mutation -------- */
  const { mutate, isPending } = useMutation({
    mutationFn: medicineApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todaySchedule"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });

      if (onSuccess) onSuccess();
    },
  });

  /* -------- Submit Handler -------- */
  const onSubmit = (values) => {
    const timesArray = values.times
      .split(",")
      .map((t) => t.trim());

    mutate({
      ...values,
      times: timesArray,
      start_date: new Date(values.start_date).toISOString(),
    });
  };

  const errors = form.formState.errors;

  /* -------------------- UI -------------------- */
  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-5"
    >
      {/* -------- Row 1 -------- */}
      <div className="grid grid-cols-2 gap-4">
        {/* Medicine Name */}
        <div>
          <label className="label">Medicine Name</label>
          <input
            {...form.register("name")}
            className="input"
          />
          {errors.name && <p className="error">{errors.name.message}</p>}
        </div>

        {/* Dosage + Unit */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="label">Dosage</label>
            <input
              type="number"
              step="0.1"
              {...form.register("dosage", { valueAsNumber: true })}
              className="input"
            />
          </div>

          <div className="w-20">
            <label className="label">Unit</label>
            <input
              {...form.register("unit")}
              placeholder="mg"
              className="input"
            />
          </div>
        </div>
      </div>

      {/* -------- Row 2 -------- */}
      <div className="grid grid-cols-2 gap-4">
        {/* Frequency */}
        <div>
          <label className="label">Frequency</label>
          <select {...form.register("frequency")} className="input">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* Times */}
        <div>
          <label className="label">Times (HH:MM)</label>
          <input
            {...form.register("times")}
            placeholder="08:00, 20:00"
            className="input"
          />
        </div>
      </div>

      {/* -------- Row 3 -------- */}
      <div className="grid grid-cols-2 gap-4">
        {/* Food Instruction */}
        <div>
          <label className="label">Food Instruction</label>
          <select {...form.register("food_instruction")} className="input">
            <option value="">None</option>
            <option value="before">Before Food</option>
            <option value="after">After Food</option>
            <option value="with">With Food</option>
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label className="label">Start Date</label>
          <input
            type="date"
            {...form.register("start_date")}
            className="input"
          />
        </div>
      </div>

      {/* -------- Submit Button -------- */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition"
      >
        {isPending ? "Adding..." : "Add Medicine"}
      </button>
    </form>
  );
};