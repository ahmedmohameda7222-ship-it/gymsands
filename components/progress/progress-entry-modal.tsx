"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { addProgressEntry } from "@/services/database/repository";
import { todayIso } from "@/lib/utils";
import type { ProgressEntry } from "@/types";

const measurementFields = [
  ["hips_cm", "Hips cm", "Hips measurement, e.g. 96"],
  ["chest_cm", "Chest cm", "Chest measurement, e.g. 100"],
  ["shoulders_cm", "Shoulders cm", "Shoulders measurement, e.g. 112"],
  ["left_arm_cm", "Left arm cm", "Left arm measurement, e.g. 34"],
  ["right_arm_cm", "Right arm cm", "Right arm measurement, e.g. 34"],
  ["left_thigh_cm", "Left thigh cm", "Left thigh measurement, e.g. 58"],
  ["right_thigh_cm", "Right thigh cm", "Right thigh measurement, e.g. 58"],
  ["glutes_cm", "Glutes / hips cm", "Glutes measurement, e.g. 100"],
  ["calves_cm", "Calves cm", "Calves measurement, e.g. 38"],
  ["neck_cm", "Neck cm", "Neck measurement, e.g. 38"],
  ["body_fat_percent", "Manual body fat %", "Optional manual estimate, e.g. 22"]
];

export function ProgressEntryModal({ onSaved }: { onSaved?: (entry: ProgressEntry) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [notes, setNotes] = useState("");
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in before saving progress entries." });
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
        [],
        extraMeasurements
      );
      onSaved?.(entry);
      toast({ title: "Progress entry saved", description: "Your real progress data has been updated." });
      setOpen(false);
      setEntryDate(todayIso());
      setWeight("");
      setWaist("");
      setNotes("");
      setMeasurements({});
    } catch (error) {
      toast({ title: "Could not save progress", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add progress entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add progress entry</DialogTitle>
          <DialogDescription>Track body weight and real body measurements. Progress photos are managed privately on the Progress page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="progress-date">Date</Label>
            <Input id="progress-date" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="progress-weight">Body weight kg</Label>
            <Input id="progress-weight" type="number" step="0.1" min="0" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="Weight in kg, e.g. 72.5" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="progress-waist">Waist cm</Label>
            <Input id="progress-waist" type="number" step="0.1" min="0" value={waist} onChange={(event) => setWaist(event.target.value)} placeholder="Waist in cm, e.g. 82" />
          </div>
          {measurementFields.map(([id, label, placeholder]) => (
            <div key={id} className="space-y-2">
              <Label htmlFor={id}>{label}</Label>
              <Input id={id} type="number" min="0" step="0.1" value={measurements[id] ?? ""} onChange={(event) => setMeasurements((current) => ({ ...current, [id]: event.target.value }))} placeholder={placeholder} />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="progress-notes">Notes</Label>
            <Input id="progress-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Progress note, e.g. energy felt better this week" />
          </div>
        </div>
        <Button onClick={save} className="w-full" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save progress entry"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
