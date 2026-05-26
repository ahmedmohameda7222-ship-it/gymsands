"use client";

import { useState } from "react";
import { Camera, Plus } from "lucide-react";
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
  ["waist_cm", "Waist cm", "Waist measurement, e.g. 82"],
  ["hips_cm", "Hips cm", "Hips measurement, e.g. 96"],
  ["chest_cm", "Chest / bust cm", "Chest measurement, e.g. 100"],
  ["neck_cm", "Neck cm", "Neck measurement, e.g. 38"],
  ["left_arm_cm", "Left arm cm", "Left arm measurement, e.g. 34"],
  ["right_arm_cm", "Right arm cm", "Right arm measurement, e.g. 34"],
  ["left_thigh_cm", "Left thigh cm", "Left thigh measurement, e.g. 58"],
  ["right_thigh_cm", "Right thigh cm", "Right thigh measurement, e.g. 58"]
];

export function ProgressEntryModal({ onSaved }: { onSaved?: (entry: ProgressEntry) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
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
          user_id: user?.id ?? "mock-user",
          entry_date: todayIso(),
          body_weight_kg: weight && Number.isFinite(bodyWeight) ? bodyWeight : null,
          waist_cm: waist && Number.isFinite(waistValue) ? waistValue : null,
          notes: notes || null
        },
        photos,
        extraMeasurements
      );
      onSaved?.(entry);
      toast({ title: "Progress entry saved", description: "Your progress page has been updated." });
      setOpen(false);
      setWeight("");
      setWaist("");
      setNotes("");
      setPhotos([]);
      setMeasurements({});
    } catch (error) {
      toast({
        title: "Could not save progress",
        description: error instanceof Error ? error.message : "Please try again."
      });
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
          <DialogDescription>Track body weight, measurements, notes, and optional progress photos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="progress-weight">Body weight kg</Label>
            <Input
              id="progress-weight"
              type="number"
              step="0.1"
              min="0"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder="Weight in kg, e.g. 72.5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="progress-waist">Waist cm</Label>
            <Input
              id="progress-waist"
              type="number"
              step="0.1"
              min="0"
              value={waist}
              onChange={(event) => setWaist(event.target.value)}
              placeholder="Waist in cm, e.g. 82"
            />
          </div>
          {measurementFields.slice(1).map(([id, label, placeholder]) => (
            <div key={id} className="space-y-2">
              <Label htmlFor={id}>{label}</Label>
              <Input
                id={id}
                type="number"
                min="0"
                step="0.1"
                value={measurements[id] ?? ""}
                onChange={(event) => setMeasurements((current) => ({ ...current, [id]: event.target.value }))}
                placeholder={placeholder}
              />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="progress-notes">Notes</Label>
            <Input
              id="progress-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Progress note, e.g. energy felt better this week"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="progress-photos">Progress photos</Label>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-blue-50 p-4 text-center">
              <Camera className="h-6 w-6 text-primary" />
              <span className="mt-2 text-sm font-medium">Upload optional photos</span>
              <span className="mt-1 text-xs text-muted-foreground">{photos.length ? `${photos.length} selected` : "JPG or PNG from your phone"}</span>
              <input
                id="progress-photos"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>
        </div>
        <Button onClick={save} className="w-full" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save progress entry"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
