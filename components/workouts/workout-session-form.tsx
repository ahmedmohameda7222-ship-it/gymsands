"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { completeWorkoutSession, saveWorkoutSetLogs, startWorkoutSession } from "@/services/database/repository";
import type { Workout, WorkoutSession } from "@/types";

type SetLog = {
  reps: number;
  weight: number;
  notes: string;
};

export function WorkoutSessionForm({ workout }: { workout: Workout }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [duration, setDuration] = useState(45);
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState<SetLog[]>([{ reps: 10, weight: 0, notes: "" }]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    startWorkoutSession(user?.id ?? "mock-user", workout)
      .then(setSession)
      .catch((error) =>
        toast({
          title: "Workout opened without cloud session",
          description: error instanceof Error ? error.message : "You can still log this workout on screen."
        })
      );
  }, [toast, user, workout]);

  async function complete() {
    try {
      setIsSaving(true);
      if (session) {
        await saveWorkoutSetLogs(
          session.id,
          sets.map((set, index) => ({
            exerciseName: workout.name,
            exerciseCategory: workout.category || workout.target_muscle,
            plannedSets: workout.sets ?? sets.length,
            plannedReps: workout.reps,
            plannedRestSeconds: workout.rest_seconds,
            setNumber: index + 1,
            reps: Number.isFinite(set.reps) ? set.reps : null,
            weightKg: Number.isFinite(set.weight) ? set.weight : null,
            notes: set.notes || null,
            completedAt: new Date().toISOString()
          }))
        );
        await completeWorkoutSession(session.id, notes, duration);
      }
      toast({ title: "Workout completed", description: `${workout.name} was saved to your S&S Gym history.` });
      router.push("/workout-history");
    } catch (error) {
      toast({
        title: "Could not save workout",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log workout results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sets.map((set, index) => (
          <div key={index} className="rounded-md border p-3">
            <p className="mb-3 text-sm font-semibold">Set {index + 1}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`reps-${index}`}>Reps</Label>
                <Input
                  id={`reps-${index}`}
                  type="number"
                  min="0"
                  value={set.reps}
                  onChange={(event) =>
                    setSets((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, reps: Number(event.target.value) } : item)))
                  }
                  placeholder="Reps completed, e.g. 10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`weight-${index}`}>Weight kg</Label>
                <Input
                  id={`weight-${index}`}
                  type="number"
                  min="0"
                  step="0.5"
                  value={set.weight}
                  onChange={(event) =>
                    setSets((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, weight: Number(event.target.value) } : item)))
                  }
                  placeholder="Weight used, e.g. 40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`set-note-${index}`}>Set note</Label>
                <Input
                  id={`set-note-${index}`}
                  value={set.notes}
                  onChange={(event) =>
                    setSets((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, notes: event.target.value } : item)))
                  }
                  placeholder="Set note, e.g. smooth reps"
                />
              </div>
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={() => setSets((current) => [...current, { reps: 10, weight: 0, notes: "" }])}>
          <Plus className="h-4 w-4" />
          Add set
        </Button>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="duration">Duration minutes</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              placeholder="Workout duration, e.g. 45"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workout-notes">Workout notes</Label>
            <Input
              id="workout-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Workout note, e.g. felt strong today"
            />
          </div>
        </div>
        <Button className="w-full" onClick={complete} disabled={isSaving}>
          <CheckCircle2 className="h-4 w-4" />
          {isSaving ? "Saving workout..." : "Mark workout completed"}
        </Button>
      </CardContent>
    </Card>
  );
}
