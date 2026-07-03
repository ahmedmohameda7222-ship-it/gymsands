"use client";

import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { clearStoredValue, readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";
import Link from "next/link";
import {
  updateUserWorkoutPlanDay,
  weekDays,
  workoutsFromPlanDay
} from "@/services/database/workout-plans";
import type { Weekday, Workout, WorkoutPlanDaySession } from "@/types";

type EditorDraft = {
  dayName: string;
  weekday: Weekday | null;
  notes: string;
  exercises: Workout[];
};

function withTrainingDefaults(workout: Workout): Workout {
  return {
    ...workout,
    sets: workout.sets ?? 3,
    reps: workout.reps ?? "8-12",
    rest_seconds: workout.rest_seconds ?? 75
  };
}

function draftFromDay(day: WorkoutPlanDaySession): EditorDraft {
  return {
    dayName: day.day_name,
    weekday: day.weekday,
    notes: day.notes ?? "",
    exercises: workoutsFromPlanDay(day).map(withTrainingDefaults)
  };
}

function isLink(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function WorkoutDayEditor({ day }: { day: WorkoutPlanDaySession }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const draftKey = useMemo(() => workoutStorageKey(["workout-day-draft", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const [draft, setDraft] = useState<EditorDraft>(() => draftFromDay(day));
  const [isHydrated, setIsHydrated] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const stored = readStoredJson<EditorDraft>(draftKey);
    setDraft(stored ?? draftFromDay(day));
    setIsHydrated(true);
  }, [day, draftKey]);

  useEffect(() => {
    if (!isHydrated) return;
    storeJson(draftKey, draft);
  }, [draft, draftKey, isHydrated]);

  function patchDraft(patch: Partial<EditorDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateExercise(index: number, patch: Partial<Workout>) {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, itemIndex) => (itemIndex === index ? { ...exercise, ...patch } : exercise))
    }));
  }

  function removeExercise(index: number) {
    setDraft((current) => ({ ...current, exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index) }));
    setEditingIndex(null);
  }

  function moveExercise(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.exercises.length) return current;
      const exercises = [...current.exercises];
      const [item] = exercises.splice(index, 1);
      exercises.splice(nextIndex, 0, item);
      return { ...current, exercises };
    });
    setEditingIndex((current) => (current === index ? index + direction : current));
  }

  async function saveWorkout() {
    if (isSaving) return;
    try {
      setIsSaving(true);
      await updateUserWorkoutPlanDay(day.id, {
        dayName: draft.dayName,
        weekday: draft.weekday,
        notes: draft.notes,
        exercises: draft.exercises
      });
      clearStoredValue(draftKey);
      toast({ title: "Workout day saved", description: `${draft.dayName} now has ${draft.exercises.length} exercises.` });
      router.push("/my-workout/plans");
    } catch (error) {
      toast({ title: "Could not save workout day", description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function cancelEditing() {
    clearStoredValue(draftKey);
    router.push("/my-workout/plans");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/my-workout/plans">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={cancelEditing}>
            <RotateCcw className="h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={saveWorkout} disabled={isSaving || !draft.exercises.length}>
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Workout"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workout day</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <Label>Day name</Label>
            <Input value={draft.dayName} onChange={(event) => patchDraft({ dayName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Weekday</Label>
            <Select value={draft.weekday ?? undefined} onValueChange={(weekday) => patchDraft({ weekday: weekday as Weekday })}>
              <SelectTrigger>
                <SelectValue placeholder="Choose weekday" />
              </SelectTrigger>
              <SelectContent>
                {weekDays.map((weekday) => (
                  <SelectItem key={weekday} value={weekday}>{weekday}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <textarea
              value={draft.notes}
              onChange={(event) => patchDraft({ notes: event.target.value })}
              className="min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Exercises</CardTitle>
            <p className="text-sm text-muted-foreground">Reorder, edit, or remove exercises before saving this workout day.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!draft.exercises.length ? <p className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">No exercises added yet.</p> : null}
            {draft.exercises.map((exercise, index) => {
              const guideUrl = exercise.exercise_url || (isLink(exercise.notes) ? exercise.notes : null);
              const customVideoUrl = exercise.custom_video_url || null;
              const isEditing = editingIndex === index;
              return (
                <div key={`${exercise.id}-${index}`} className="rounded-md border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{index + 1}. {exercise.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {exercise.muscle_category || exercise.target_muscle} | {exercise.equipment_required || exercise.equipment}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => moveExercise(index, -1)} disabled={index === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => moveExercise(index, 1)} disabled={index === draft.exercises.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingIndex(isEditing ? null : index)}>
                        <Pencil className="h-4 w-4" />
                        Edit Exercise
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeExercise(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{exercise.sets ?? 3} sets</Badge>
                    <Badge variant="outline">{exercise.reps ?? "8-12"}</Badge>
                    <Badge variant="outline">{exercise.rest_seconds ?? 75}s rest</Badge>
                    {exercise.mechanics ? <Badge variant="outline">{exercise.mechanics}</Badge> : null}
                    {exercise.force_type ? <Badge variant="outline">{exercise.force_type}</Badge> : null}
                  </div>

                  {isEditing ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label>Sets</Label>
                        <Input type="number" min="1" inputMode="numeric" enterKeyHint="done" value={exercise.sets ?? 3} onChange={(event) => updateExercise(index, { sets: Math.max(1, Number(event.target.value) || 1) })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Planned reps</Label>
                        <Input value={exercise.reps ?? "8-12"} onChange={(event) => updateExercise(index, { reps: event.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Rest seconds</Label>
                        <Input type="number" min="0" inputMode="numeric" enterKeyHint="done" value={exercise.rest_seconds ?? 75} onChange={(event) => updateExercise(index, { rest_seconds: Math.max(0, Number(event.target.value) || 0) })} />
                      </div>
                      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                        <Label>Custom video URL</Label>
                        <Input
                          value={exercise.custom_video_url ?? ""}
                          onChange={(event) => updateExercise(index, { custom_video_url: event.target.value, video_url: event.target.value })}
                          placeholder="Optional user-added URL"
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/workouts/${exercise.id}`}>Details</Link>
                    </Button>
                    {guideUrl ? (
                      <Button asChild variant="ghost" size="sm">
                        <a href={guideUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open Exercise Guide
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" disabled>
                        No guide added
                      </Button>
                    )}
                    {customVideoUrl ? (
                      <Button asChild variant="ghost" size="sm">
                        <a href={customVideoUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open Custom Video
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" disabled>
                        No custom video
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add exercises</CardTitle>
            <p className="text-sm text-muted-foreground">Open the exercise browser on its own page, add movements, then return here to save the workout day.</p>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/my-workout/day/${day.id}/add-exercise`}>
                <Plus className="h-4 w-4" />
                Add Exercise
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
