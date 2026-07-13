"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Dumbbell, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeading } from "@/components/layout/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select-field";
import { ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { clearStoredValue, readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";
import { getWorkoutPlanById, saveWorkoutPlan } from "@/services/database/workout-plan-loader";
import type { UserWorkoutPlan, UserWorkoutPlanDay, UserWorkoutPlanExercise, Weekday } from "@/types";

type EditorExercise = UserWorkoutPlanExercise & { clientKey: string };
type EditorDay = Omit<UserWorkoutPlanDay, "exercises"> & { clientKey: string; session_duration_minutes?: number | null; exercises: EditorExercise[] };
type EditorPlan = Omit<UserWorkoutPlan, "days"> & { days: EditorDay[] };
type StoredEditorDraft = { plan: EditorPlan; baseUpdatedAt: string };
type SaveState = "idle" | "restored" | "dirty" | "saving" | "saved" | "failed";

const weekDays: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clientKey(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

function toEditorPlan(plan: UserWorkoutPlan): EditorPlan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      clientKey: day.id || clientKey("day"),
      exercises: day.exercises.map((exercise) => ({ ...exercise, clientKey: exercise.id || clientKey("exercise") }))
    }))
  };
}

function toSavePlan(plan: EditorPlan): UserWorkoutPlan {
  return {
    ...plan,
    days: plan.days.map(({ clientKey: _clientKey, ...day }, dayIndex) => ({
      ...day,
      day_number: dayIndex + 1,
      exercises: day.exercises.map(({ clientKey: _exerciseKey, ...exercise }, exerciseIndex) => ({
        ...exercise,
        sort_order: exerciseIndex + 1
      }))
    }))
  };
}

function plansEqual(left: EditorPlan, right: EditorPlan) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function newExercise(dayId: string): EditorExercise {
  return {
    clientKey: clientKey("exercise"), id: "", plan_day_id: dayId, workout_id: null, source_workout_id: null,
    exercise_name: "", category: "strength", target_muscle: null, equipment: null,
    sets: 3, reps: "8-12", rest_seconds: 75, sort_order: 1, notes: null
  };
}

function validatePlan(plan: EditorPlan) {
  if (!plan.name.trim()) return "Enter a plan name.";
  if (!plan.days.length) return "Add at least one training day.";
  if (plan.program_duration_weeks && (plan.program_duration_weeks < 1 || plan.program_duration_weeks > 104)) return "Plan duration must be between 1 and 104 weeks.";
  const scheduled = plan.days.map((day) => day.weekday).filter(Boolean);
  if (new Set(scheduled).size !== scheduled.length) return "Each scheduled weekday can only be used once.";
  for (const day of plan.days) {
    if (!day.day_name.trim()) return "Every training day needs a name.";
    if (!day.exercises.length) return `${day.day_name} needs at least one exercise.`;
    if (day.exercises.some((exercise) => !exercise.exercise_name.trim())) return `Every exercise in ${day.day_name} needs a name.`;
    if (day.exercises.some((exercise) => !exercise.sets || exercise.sets < 1 || (exercise.rest_seconds ?? 0) < 0)) return `${day.day_name} has invalid sets or rest values.`;
  }
  return null;
}

export function WorkoutPlanEditor() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const [basePlan, setBasePlan] = useState<EditorPlan | null>(null);
  const [draft, setDraft] = useState<EditorPlan | null>(null);
  const [draftBaseUpdatedAt, setDraftBaseUpdatedAt] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const draftKey = useMemo(() => workoutStorageKey(["workout-plan-draft", user?.id ?? "anonymous", params.planId]), [params.planId, user?.id]);

  useEffect(() => {
    let current = true;
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      setLoadError(null);
      try {
        const plan = await getWorkoutPlanById(user.id, params.planId);
        if (!current) return;
        if (!plan) { setLoadError("This workout plan could not be found."); return; }
        const base = toEditorPlan(plan);
        const stored = readStoredJson<StoredEditorDraft>(draftKey);
        const restored = stored?.plan?.days && stored.baseUpdatedAt ? stored : null;
        setBasePlan(base);
        setDraft(restored && !plansEqual(restored.plan, base) ? restored.plan : base);
        setDraftBaseUpdatedAt(restored?.baseUpdatedAt ?? base.updated_at);
        setSaveState(restored && !plansEqual(restored.plan, base) ? "restored" : "idle");
        setSelectedDayKey((restored?.plan.days[0] ?? base.days[0])?.clientKey ?? null);
      } catch (error) {
        if (current) setLoadError(userSafeError(error, "The editor could not load. Your saved plan was not changed."));
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, [draftKey, params.planId, user]);

  const isDirty = Boolean(basePlan && draft && !plansEqual(basePlan, draft));
  const selectedDayIndex = draft?.days.findIndex((day) => day.clientKey === selectedDayKey) ?? -1;
  const selectedDay = selectedDayIndex >= 0 ? draft?.days[selectedDayIndex] ?? null : draft?.days[0] ?? null;
  const validationError = draft ? validatePlan(draft) : null;

  useEffect(() => {
    if (!draft || !basePlan) return;
    if (plansEqual(draft, basePlan)) clearStoredValue(draftKey);
    else if (draftBaseUpdatedAt) storeJson(draftKey, { plan: draft, baseUpdatedAt: draftBaseUpdatedAt } satisfies StoredEditorDraft);
  }, [basePlan, draft, draftBaseUpdatedAt, draftKey]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function change(mutator: (current: EditorPlan) => EditorPlan) {
    setDraft((current) => current ? mutator(current) : current);
    setSaveState("dirty");
    setSaveError(null);
  }

  function patchPlan(patch: Partial<EditorPlan>) { change((current) => ({ ...current, ...patch })); }
  function patchDay(index: number, patch: Partial<EditorDay>) { change((current) => ({ ...current, days: current.days.map((day, itemIndex) => itemIndex === index ? { ...day, ...patch } : day) })); }
  function patchExercise(dayIndex: number, exerciseIndex: number, patch: Partial<EditorExercise>) { change((current) => ({ ...current, days: current.days.map((day, itemIndex) => itemIndex === dayIndex ? { ...day, exercises: day.exercises.map((exercise, index) => index === exerciseIndex ? { ...exercise, ...patch } : exercise) } : day) })); }

  function moveDay(index: number, direction: -1 | 1) {
    change((current) => { const next = index + direction; if (next < 0 || next >= current.days.length) return current; const days = [...current.days]; const [day] = days.splice(index, 1); days.splice(next, 0, day); return { ...current, days }; });
  }

  function addDay() {
    if (!draft || draft.days.length >= 7) return;
    const used = new Set(draft.days.map((day) => day.weekday));
    const weekday = weekDays.find((day) => !used.has(day)) ?? null;
    const key = clientKey("day");
    const day: EditorDay = { clientKey: key, id: "", plan_id: draft.id, day_number: draft.days.length + 1, day_name: `Workout day ${draft.days.length + 1}`, weekday, notes: null, exercises: [newExercise("")] };
    change((current) => ({ ...current, days: [...current.days, day] }));
    setSelectedDayKey(key);
  }

  function removeDay(index: number) {
    if (!draft || draft.days.length <= 1) return;
    const target = draft.days[index];
    ask({ title: `Remove ${target.day_name}?`, description: "The day and its exercises leave this draft. Saved history identities are preserved when you save.", confirmLabel: "Remove day", variant: "destructive", onConfirm: () => {
      change((current) => ({ ...current, days: current.days.filter((_, itemIndex) => itemIndex !== index) }));
      setSelectedDayKey(draft.days[index - 1]?.clientKey ?? draft.days[index + 1]?.clientKey ?? null);
    } });
  }

  function addExercise(dayIndex: number) {
    change((current) => ({ ...current, days: current.days.map((day, index) => index === dayIndex ? { ...day, exercises: [...day.exercises, newExercise(day.id)] } : day) }));
  }

  function moveExercise(dayIndex: number, exerciseIndex: number, direction: -1 | 1) {
    change((current) => ({ ...current, days: current.days.map((day, index) => {
      if (index !== dayIndex) return day;
      const next = exerciseIndex + direction;
      if (next < 0 || next >= day.exercises.length) return day;
      const exercises = [...day.exercises]; const [exercise] = exercises.splice(exerciseIndex, 1); exercises.splice(next, 0, exercise);
      return { ...day, exercises };
    }) }));
  }

  function removeExercise(dayIndex: number, exerciseIndex: number) {
    const exercise = draft?.days[dayIndex]?.exercises[exerciseIndex];
    if (!exercise) return;
    ask({ title: `Remove ${exercise.exercise_name || "this exercise"}?`, description: "The exercise leaves this draft. Its saved history identity is preserved when you save.", confirmLabel: "Remove exercise", variant: "destructive", onConfirm: () => {
      change((current) => ({ ...current, days: current.days.map((day, index) => index === dayIndex ? { ...day, exercises: day.exercises.filter((_, itemIndex) => itemIndex !== exerciseIndex) } : day) }));
    } });
  }

  async function save() {
    if (!draft || !basePlan || !draftBaseUpdatedAt || !user?.id || validationError || saveState === "saving") return;
    setSaveState("saving"); setSaveError(null);
    try {
      await saveWorkoutPlan(user.id, draft.id, toSavePlan(draft), draftBaseUpdatedAt);
      clearStoredValue(draftKey);
      setSaveState("saved");
      toast({ title: "Workout plan saved", description: "All plan changes were applied together." });
      router.push(`/my-workout/plans/${draft.id}`);
    } catch (error) {
      const message = userSafeError(error, "Save failed. Your draft is still on this device.");
      setSaveError(message); setSaveState("failed");
      toast({ title: "Could not save plan", description: message, variant: "error" });
    }
  }

  function cancel() {
    if (!isDirty) { router.push(`/my-workout/plans/${params.planId}`); return; }
    ask({ title: "Discard plan changes?", description: "This removes the local draft. The saved plan stays unchanged.", confirmLabel: "Discard draft", variant: "destructive", onConfirm: () => { clearStoredValue(draftKey); router.push(`/my-workout/plans/${params.planId}`); } });
  }

  if (loading) return <div className="space-y-4" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded-lg bg-muted" /><div className="h-96 animate-pulse rounded-2xl bg-muted" /></div>;
  if (loadError || !draft) return <ErrorState title="Editor unavailable" description={loadError || "This plan could not load."} fallbackHref="/my-workout/plans" fallbackLabel="Back to Train" />;

  return (
    <div className="space-y-6 pb-24">
      <PageHeading title={`Edit ${draft.name}`} description="Update the whole plan, review every day, then apply everything with one save." action={<Button variant="outline" onClick={cancel}><ArrowLeft className="h-4 w-4" /> Cancel</Button>} />

      {saveState === "restored" ? <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Local draft restored</p><p className="text-muted-foreground">These changes have not been saved to your plan yet.</p></div></div> : null}

      <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2"><Label htmlFor="plan-name">Plan name</Label><Input id="plan-name" value={draft.name} onChange={(event) => patchPlan({ name: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="plan-goal">Goal</Label><Input id="plan-goal" value={draft.goal ?? ""} onChange={(event) => patchPlan({ goal: event.target.value || null })} placeholder="Strength, endurance, mobility…" /></div>
        <div className="space-y-2"><Label htmlFor="plan-weeks">Duration in weeks</Label><Input id="plan-weeks" type="number" min={1} max={104} value={draft.program_duration_weeks ?? ""} onChange={(event) => patchPlan({ program_duration_weeks: event.target.value ? Number(event.target.value) : null })} /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="plan-description">Description</Label><textarea id="plan-description" className="min-h-24 w-full rounded-[14px] border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.description ?? ""} onChange={(event) => patchPlan({ description: event.target.value || null })} /></div>
      </CardContent></Card>

      <section className="space-y-3" aria-labelledby="editor-days-heading">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="editor-days-heading" className="text-xl font-semibold">Training days</h2><p className="text-sm text-muted-foreground">Select a day to edit its schedule and exercises.</p></div><Button variant="outline" onClick={addDay} disabled={draft.days.length >= 7}><Plus className="h-4 w-4" /> Add day</Button></div>
        <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Workout days">
          {draft.days.map((day, index) => <div key={day.clientKey} className={`flex min-w-48 items-center gap-1 rounded-2xl border p-1 ${day.clientKey === selectedDay?.clientKey ? "border-primary bg-primary/10" : "bg-card"}`}><button type="button" role="tab" aria-selected={day.clientKey === selectedDay?.clientKey} className="min-h-12 min-w-0 flex-1 rounded-xl px-3 text-start" onClick={() => setSelectedDayKey(day.clientKey)}><span className="block truncate font-semibold">{day.day_name}</span><span className="block text-xs text-muted-foreground">{day.weekday || "Unscheduled"}</span></button><Button type="button" variant="ghost" size="icon" aria-label={`Move ${day.day_name} up`} onClick={() => moveDay(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Move ${day.day_name} down`} onClick={() => moveDay(index, 1)} disabled={index === draft.days.length - 1}><ArrowDown className="h-4 w-4" /></Button></div>)}
        </div>
      </section>

      {selectedDay && selectedDayIndex >= 0 ? <Card><CardContent className="space-y-6 p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <div className="space-y-2"><Label htmlFor="day-name">Day name</Label><Input id="day-name" value={selectedDay.day_name} onChange={(event) => patchDay(selectedDayIndex, { day_name: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="day-weekday">Weekday</Label><Select id="day-weekday" value={selectedDay.weekday ?? ""} onChange={(value) => patchDay(selectedDayIndex, { weekday: (value || null) as Weekday | null })} placeholder="Unscheduled" options={weekDays} /></div>
          <Button variant="ghost" className="text-destructive" onClick={() => removeDay(selectedDayIndex)} disabled={draft.days.length <= 1}><Trash2 className="h-4 w-4" /> Remove day</Button>
        </div>
        <div className="space-y-2"><Label htmlFor="day-notes">Day notes</Label><Input id="day-notes" value={selectedDay.notes ?? ""} onChange={(event) => patchDay(selectedDayIndex, { notes: event.target.value || null })} placeholder="Optional focus or coaching note" /></div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Exercises</h3><p className="text-sm text-muted-foreground">Edit targets and use the arrows to set workout order.</p></div><div className="flex items-center gap-2"><Badge variant="outline">{selectedDay.exercises.length}</Badge><Button variant="outline" onClick={() => addExercise(selectedDayIndex)}><Plus className="h-4 w-4" /> Add exercise</Button></div></div>
          {selectedDay.exercises.map((exercise, exerciseIndex) => <div key={exercise.clientKey} className="rounded-2xl border bg-muted/20 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_150px_110px_110px_110px_auto] lg:items-end">
              <div className="space-y-2"><Label htmlFor={`exercise-name-${exercise.clientKey}`}>Exercise {exerciseIndex + 1}</Label><Input id={`exercise-name-${exercise.clientKey}`} value={exercise.exercise_name} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { exercise_name: event.target.value })} placeholder="Exercise name" /></div>
              <div className="space-y-2"><Label htmlFor={`muscle-${exercise.clientKey}`}>Target</Label><Input id={`muscle-${exercise.clientKey}`} value={exercise.target_muscle ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { target_muscle: event.target.value || null })} placeholder="Chest" /></div>
              <div className="space-y-2"><Label htmlFor={`sets-${exercise.clientKey}`}>Sets</Label><Input id={`sets-${exercise.clientKey}`} type="number" min={1} value={exercise.sets ?? 3} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { sets: Number(event.target.value) || 0 })} /></div>
              <div className="space-y-2"><Label htmlFor={`reps-${exercise.clientKey}`}>Reps</Label><Input id={`reps-${exercise.clientKey}`} value={exercise.reps ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { reps: event.target.value || null })} /></div>
              <div className="space-y-2"><Label htmlFor={`rest-${exercise.clientKey}`}>Rest sec</Label><Input id={`rest-${exercise.clientKey}`} type="number" min={0} value={exercise.rest_seconds ?? 75} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { rest_seconds: Number(event.target.value) || 0 })} /></div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Move ${exercise.exercise_name || "exercise"} up`} onClick={() => moveExercise(selectedDayIndex, exerciseIndex, -1)} disabled={exerciseIndex === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Move ${exercise.exercise_name || "exercise"} down`} onClick={() => moveExercise(selectedDayIndex, exerciseIndex, 1)} disabled={exerciseIndex === selectedDay.exercises.length - 1}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={`Remove ${exercise.exercise_name || "exercise"}`} onClick={() => removeExercise(selectedDayIndex, exerciseIndex)}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          </div>)}
          {!selectedDay.exercises.length ? <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed text-center"><div><Dumbbell className="mx-auto mb-2 h-5 w-5 text-muted-foreground" /><p className="font-medium">Add at least one exercise</p></div></div> : null}
        </div>
      </CardContent></Card> : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur sm:static sm:rounded-2xl sm:border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm"><p className="font-semibold">{saveState === "saving" ? "Saving all changes…" : saveState === "saved" ? "Changes saved" : isDirty ? "Unsaved changes" : "No unsaved changes"}</p>{validationError ? <p className="text-destructive">{validationError}</p> : saveError ? <p className="text-destructive">{saveError}</p> : <p className="text-muted-foreground">One save applies the complete plan atomically.</p>}</div>
          <div className="flex gap-2"><Button variant="outline" onClick={cancel}>Cancel</Button><Button onClick={() => void save()} disabled={!isDirty || Boolean(validationError) || saveState === "saving"}>{saveState === "saved" ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saveState === "saving" ? "Saving…" : "Save changes"}</Button></div>
        </div>
      </div>
      {dialog}
    </div>
  );
}
