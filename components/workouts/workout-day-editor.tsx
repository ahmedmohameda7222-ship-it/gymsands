"use client";

import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, ExternalLink, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
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

type SaveStatus = "idle" | "restored" | "dirty" | "saving" | "saved" | "failed";

type RemovedExercise = {
  exercise: Workout;
  index: number;
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

function hasInvalidCustomVideoUrl(workout: Workout) {
  const value = workout.custom_video_url?.trim();
  return Boolean(value && !/^https?:\/\//i.test(value));
}

function draftsEqual(left: EditorDraft, right: EditorDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function WorkoutDayEditor({ day }: { day: WorkoutPlanDaySession }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { dialog, ask } = useConfirm();
  const draftKey = useMemo(() => workoutStorageKey(["workout-day-draft", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const baseDraft = useMemo(() => draftFromDay(day), [day]);
  const returnHref = day.plan?.id ? `/my-workout/plans/${day.plan.id}` : "/my-workout/plans";
  const [draft, setDraft] = useState<EditorDraft>(() => draftFromDay(day));
  const [isHydrated, setIsHydrated] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [lastRemoved, setLastRemoved] = useState<RemovedExercise | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = !draftsEqual(draft, baseDraft);
  const invalidVideoIndexes = draft.exercises.map((exercise, index) => (hasInvalidCustomVideoUrl(exercise) ? index : -1)).filter((index) => index >= 0);
  const hasInvalidVideoUrl = invalidVideoIndexes.length > 0;

  useEffect(() => {
    const stored = readStoredJson<EditorDraft>(draftKey);
    if (stored && !draftsEqual(stored, baseDraft)) {
      setDraft(stored);
      setDraftRestored(true);
      setSaveStatus("restored");
    } else {
      setDraft(baseDraft);
      setDraftRestored(false);
      setSaveStatus("idle");
      clearStoredValue(draftKey);
    }
    setIsHydrated(true);
  }, [baseDraft, draftKey]);

  useEffect(() => {
    if (!isHydrated) return;
    if (draftsEqual(draft, baseDraft)) {
      clearStoredValue(draftKey);
      return;
    }
    storeJson(draftKey, draft);
  }, [baseDraft, draft, draftKey, isHydrated]);

  function markDraftChanged() {
    setSaveStatus("dirty");
    setSaveError("");
  }

  function patchDraft(patch: Partial<EditorDraft>) {
    markDraftChanged();
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateExercise(index: number, patch: Partial<Workout>) {
    markDraftChanged();
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, itemIndex) => (itemIndex === index ? { ...exercise, ...patch } : exercise))
    }));
  }

  function removeExercise(index: number) {
    const target = draft.exercises[index];
    if (!target) return;
    ask({
      title: "Remove exercise from draft?",
      description: "Removing this exercise only changes the local draft until you save the workout day.",
      confirmLabel: "Remove from draft",
      cancelLabel: "Keep exercise",
      variant: "destructive",
      onConfirm: () => {
        markDraftChanged();
        setDraft((current) => ({ ...current, exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index) }));
        setLastRemoved({ exercise: target, index });
        setEditingIndex(null);
      }
    });
  }

  function moveExercise(index: number, direction: -1 | 1) {
    markDraftChanged();
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

  function undoRemoveExercise() {
    if (!lastRemoved) return;
    markDraftChanged();
    setDraft((current) => {
      const exercises = [...current.exercises];
      exercises.splice(Math.min(lastRemoved.index, exercises.length), 0, lastRemoved.exercise);
      return { ...current, exercises };
    });
    setLastRemoved(null);
  }

  async function saveWorkout() {
    if (isSaving) return;
    if (hasInvalidVideoUrl) {
      setSaveStatus("failed");
      setSaveError("Custom video URL must start with http:// or https://.");
      return;
    }
    try {
      setIsSaving(true);
      setSaveStatus("saving");
      setSaveError("");
      await updateUserWorkoutPlanDay(day.id, {
        dayName: draft.dayName,
        weekday: draft.weekday,
        notes: draft.notes,
        exercises: draft.exercises
      });
      clearStoredValue(draftKey);
      setDraftRestored(false);
      setSaveStatus("saved");
      toast({ title: "Workout day saved", description: `${draft.dayName} now has ${draft.exercises.length} exercises.` });
      router.push(returnHref);
    } catch (error) {
      const message = userSafeError(error, "Save failed. Your draft is still on this device.");
      setSaveStatus("failed");
      setSaveError(message);
      toast({ title: "Could not save workout day", description: message });
    } finally {
      setIsSaving(false);
    }
  }

  function discardDraft() {
    clearStoredValue(draftKey);
    setDraft(baseDraft);
    setDraftRestored(false);
    setSaveStatus("idle");
    setSaveError("");
    setLastRemoved(null);
    setEditingIndex(null);
  }

  function leaveEditor() {
    router.push(returnHref);
  }

  function handleBack() {
    if (!isDirty && !draftRestored) {
      leaveEditor();
      return;
    }
    ask({
      title: "Leave editor?",
      description: "Back keeps your local draft on this device. Save when you return to apply these changes.",
      confirmLabel: "Leave editor",
      cancelLabel: "Stay here",
      onConfirm: leaveEditor
    });
  }

  function cancelEditing() {
    if (!isDirty && !draftRestored) {
      discardDraft();
      leaveEditor();
      return;
    }
    ask({
      title: "Cancel editing?",
      description: "This will discard the local draft for this workout day. Saved plan data will not change.",
      confirmLabel: "Discard draft",
      cancelLabel: "Keep editing",
      variant: "destructive",
      onConfirm: () => {
        discardDraft();
        leaveEditor();
      }
    });
  }

  const hasSaveProblem = saveStatus === "failed" || hasInvalidVideoUrl;
  const statusTone = hasSaveProblem ? "border-destructive/30 bg-destructive/5 text-destructive" : isDirty || draftRestored ? "border-primary/25 bg-primary/5 text-primary" : "border-success/25 bg-success/5 text-success";
  const statusTitle = isSaving
    ? "Saving workout day..."
    : hasInvalidVideoUrl
      ? "Fix custom video URL"
      : saveStatus === "failed"
        ? "Save failed"
        : draftRestored
          ? "Draft restored from this device"
          : isDirty
            ? "Unsaved changes"
            : saveStatus === "saved"
              ? "Saved changes to this workout day"
              : "No unsaved changes";
  const statusDescription = hasInvalidVideoUrl
    ? "Custom video URL must start with http:// or https://."
    : saveStatus === "failed"
      ? saveError || "Save failed. Your draft is still on this device."
      : draftRestored
        ? "Review the restored draft, save it, or discard it to return to the saved workout day."
        : isDirty
          ? "Save to apply these manual edits to the workout day."
          : "Manual edits are saved only when you use Save Workout.";

  return (
    <div className="space-y-4">
      <Card className={statusTone}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {hasSaveProblem ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
            <div>
              <p className="font-semibold">{statusTitle}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{statusDescription}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button type="button" variant="outline" className="min-h-12" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={cancelEditing}>
              <RotateCcw className="h-4 w-4" />
              Cancel
            </Button>
            <Button type="button" className="min-h-12" onClick={saveWorkout} disabled={isSaving || !draft.exercises.length || hasInvalidVideoUrl}>
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : saveStatus === "failed" ? "Retry save" : "Save Workout"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {draftRestored ? (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted-foreground">Draft restored from this device. Discard it only if you want to return to the saved workout day.</p>
            <Button type="button" variant="outline" className="min-h-12" onClick={discardDraft}>Discard draft</Button>
          </CardContent>
        </Card>
      ) : null}

      {lastRemoved ? (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted-foreground">Removed {lastRemoved.exercise.name} from the draft. Nothing changes in the saved plan until you save.</p>
            <Button type="button" variant="outline" className="min-h-12" onClick={undoRemoveExercise}>Undo remove</Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Workout day</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <Label>Day name</Label>
            <Input className="h-12" value={draft.dayName} onChange={(event) => patchDraft({ dayName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Weekday</Label>
            <Select value={draft.weekday ?? undefined} onValueChange={(weekday) => patchDraft({ weekday: weekday as Weekday })}>
              <SelectTrigger className="h-12">
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
              className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {!draft.exercises.length ? (
              <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                No exercises added yet. Add movements on the next page, then return here to save this workout day.
              </div>
            ) : null}
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
                      <Button variant="outline" className="min-h-12 min-w-12" onClick={() => moveExercise(index, -1)} disabled={index === 0} aria-label={`Move ${exercise.name} up`}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" className="min-h-12 min-w-12" onClick={() => moveExercise(index, 1)} disabled={index === draft.exercises.length - 1} aria-label={`Move ${exercise.name} down`}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" className="min-h-12" onClick={() => setEditingIndex(isEditing ? null : index)}>
                        <Pencil className="h-4 w-4" />
                        Edit Exercise
                      </Button>
                      <Button variant="ghost" className="min-h-12 text-destructive hover:text-destructive" onClick={() => removeExercise(index)}>
                        <Trash2 className="h-4 w-4" />
                        Remove
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
                        <Input className="h-12" type="number" min="1" inputMode="numeric" enterKeyHint="done" value={exercise.sets ?? 3} onChange={(event) => updateExercise(index, { sets: Math.max(1, Number(event.target.value) || 1) })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Planned reps</Label>
                        <Input className="h-12" value={exercise.reps ?? "8-12"} onChange={(event) => updateExercise(index, { reps: event.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Rest seconds</Label>
                        <Input className="h-12" type="number" min="0" inputMode="numeric" enterKeyHint="done" value={exercise.rest_seconds ?? 75} onChange={(event) => updateExercise(index, { rest_seconds: Math.max(0, Number(event.target.value) || 0) })} />
                      </div>
                      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                        <Label>Custom video URL</Label>
                        <Input
                          className="h-12"
                          value={exercise.custom_video_url ?? ""}
                          onChange={(event) => updateExercise(index, { custom_video_url: event.target.value, video_url: event.target.value })}
                          placeholder="Optional user-added URL"
                          aria-invalid={hasInvalidCustomVideoUrl(exercise)}
                        />
                        {hasInvalidCustomVideoUrl(exercise) ? <p className="text-xs text-destructive">Custom video URL must start with http:// or https://.</p> : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild variant="ghost" className="min-h-12">
                      <Link href={`/my-workout/exercises/${exercise.plan_exercise_id ?? exercise.id}`}>Details</Link>
                    </Button>
                    {guideUrl ? (
                      <Button asChild variant="ghost" className="min-h-12">
                        <a href={guideUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open Exercise Guide
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" className="min-h-12" disabled>
                        No guide added
                      </Button>
                    )}
                    {customVideoUrl ? (
                      <Button asChild variant="ghost" className="min-h-12">
                        <a href={customVideoUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open Custom Video
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" className="min-h-12" disabled>
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
            <Button asChild className="min-h-12 w-full">
              <Link href={`/my-workout/day/${day.id}/add-exercise`}>
                <Plus className="h-4 w-4" />
                Add Exercise
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  );
}
