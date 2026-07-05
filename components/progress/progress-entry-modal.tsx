"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { logRecoverableError, userSafeError } from "@/lib/error-formatting";
import { cn } from "@/lib/utils";
import { addProgressEntry } from "@/services/database/progress";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import type { ProgressEntry } from "@/types";

const measurementFields = [
  ["hips_cm", "Hips cm", "Hips measurement"],
  ["chest_cm", "Chest cm", "Chest measurement"],
  ["shoulders_cm", "Shoulders cm", "Shoulders measurement"],
  ["left_arm_cm", "Left arm cm", "Left arm measurement"],
  ["right_arm_cm", "Right arm cm", "Right arm measurement"],
  ["left_thigh_cm", "Left thigh cm", "Left thigh measurement "],
  ["right_thigh_cm", "Right thigh cm", "Right thigh measurement"],
  ["glutes_cm", "Glutes / hips cm", "Glutes measurement"],
  ["calves_cm", "Calves cm", "Calves measurement"],
  ["neck_cm", "Neck cm", "Neck measurement"],
  ["body_fat_percent", "Body fat %"]
] as const;

function invalidPositiveNumber(value: string) {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed < 0;
}

export function ProgressEntryModal({ onSaved, buttonClassName }: { onSaved?: (entry: ProgressEntry) => void; buttonClassName?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [open, setOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [notes, setNotes] = useState("");
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setFormError("");
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in before saving progress entries." });
      return;
    }
    if (!entryDate) {
      setFormError("Choose a date before saving this progress entry.");
      return;
    }
    if (invalidPositiveNumber(weight) || invalidPositiveNumber(waist) || Object.values(measurements).some(invalidPositiveNumber)) {
      setFormError("Measurements must be positive numbers. Empty optional fields are allowed.");
      return;
    }

    try {
      setIsSaving(true);
      const extraMeasurements = Object.fromEntries(
        Object.entries(measurements).map(([key, value]) => {
          const parsed = Number(value);
          return [key, value && Number.isFinite(parsed) ? parsed : null];
        })
      );
      const bodyWeight = Number(weight);
      const waistValue = Number(waist);
      const entry = await addProgressEntry(
        {
          user_id: user.id,
          entry_date: entryDate,
          body_weight_kg: weight && Number.isFinite(bodyWeight) ? bodyWeight : null,
          waist_cm: waist && Number.isFinite(waistValue) ? waistValue : null,
          notes: notes || null
        },
        extraMeasurements
      );
      onSaved?.(entry);
      toast({ title: "Progress entry saved", description: "Your real progress data has been updated." });
      setOpen(false);
      setEntryDate(today);
      setWeight("");
      setWaist("");
      setNotes("");
      setMeasurements({});
      setFormError("");
    } catch (error) {
      logRecoverableError("progress-entry.save", error);
      const message = userSafeError(error, "Progress could not be saved. Your typed values are still here, so you can retry.");
      setFormError(message);
      toast({ title: "Could not save progress", description: message });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn("h-12 text-base", buttonClassName)}>
          <Plus className="h-5 w-5" />
          Add progress entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add progress entry</DialogTitle>
          <DialogDescription>Track body weight and real body measurements. Progress photos are managed privately on the Progress page.</DialogDescription>
        </DialogHeader>
        {formError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="progress-date">Date</Label>
            <Input id="progress-date" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} aria-invalid={!entryDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="progress-weight">Body weight kg</Label>
            <Input id="progress-weight" type="number" step="0.1" min="0" inputMode="decimal" enterKeyHint="done" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="Weight in kg, e.g. 72.5" aria-invalid={invalidPositiveNumber(weight)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="progress-waist">Waist cm</Label>
            <Input id="progress-waist" type="number" step="0.1" min="0" inputMode="decimal" enterKeyHint="done" value={waist} onChange={(event) => setWaist(event.target.value)} placeholder="Waist cm" aria-invalid={invalidPositiveNumber(waist)} />
          </div>
    {measurementFields.map(([id, label, placeholder]) => (
    <div key={id} className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type="number" min="0" step="0.1" inputMode="decimal" enterKeyHint="done" value={measurements[id] ?? ""} onChange={(event) => setMeasurements((current) => ({ ...current, [id]: event.target.value }))} placeholder={placeholder} aria-invalid={invalidPositiveNumber(measurements[id] ?? "")} />
    </div>
    ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="progress-notes">Notes</Label>
            <Input id="progress-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Progress note, e.g. energy felt better this week" />
          </div>
        </div>
        <Button onClick={save} className="w-full h-12 text-base" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save progress entry"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
