"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Dumbbell, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ExercisePickerDialog, exerciseKey } from "@/components/workouts/exercise-picker-dialog";
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
import { useUnsavedChangesGuard } from "@/lib/hooks/use-unsaved-changes-guard";
import { useTrainTranslation, type TrainKey } from "@/lib/i18n/train";
import { clearStoredValue, readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";
import { getWorkoutPlanById, saveWorkoutPlan } from "@/services/database/workout-plan-loader";
import type { UserWorkoutPlan, UserWorkoutPlanDay, UserWorkoutPlanExercise, Weekday, Workout } from "@/types";

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

function exerciseFromLibrary(workout: Workout, dayId: string): EditorExercise {
  return {
    clientKey: clientKey("exercise"), id: "", plan_day_id: dayId, workout_id: workout.id, source_workout_id: workout.id,
    exercise_name: workout.name, category: workout.category || "strength", target_muscle: workout.target_muscle || null, equipment: workout.equipment || null,
    sets: workout.sets ?? 3, reps: workout.reps ?? "8-12", rest_seconds: workout.rest_seconds ?? 75, sort_order: 1, notes: workout.notes ?? null,
    instructions: workout.instructions, exercise_url: workout.exercise_url ?? null, video_url: workout.video_url ?? null, custom_video_url: workout.custom_video_url ?? null
  };
}

type TrainTranslator = (key: TrainKey, values?: Record<string, string | number>) => string;

function validatePlan(plan: EditorPlan, tr: TrainTranslator) {
  if (!plan.name.trim()) return tr("enterPlanName");
  if (!plan.days.length) return tr("addAtLeastOneDay");
  if (plan.program_duration_weeks && (plan.program_duration_weeks < 1 || plan.program_duration_weeks > 104)) return tr("durationRange");
  const scheduled = plan.days.map((day) => day.weekday).filter(Boolean);
  if (new Set(scheduled).size !== scheduled.length) return tr("weekdayUnique");
  for (const day of plan.days) {
    if (!day.day_name.trim()) return tr("dayNeedsName");
    if (!day.exercises.length) return tr("dayNeedsExercise", { day: day.day_name });
    if (day.exercises.some((exercise) => !exercise.exercise_name.trim())) return tr("exerciseNeedsName", { day: day.day_name });
    if (day.exercises.some((exercise) => !exercise.sets || exercise.sets < 1 || (exercise.rest_seconds ?? 0) < 0)) return tr("invalidPrescription", { day: day.day_name });
  }
  return null;
}

export function WorkoutPlanEditor() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const { dir, locale, tr } = useTrainTranslation();
  const [basePlan, setBasePlan] = useState<EditorPlan | null>(null);
  const [draft, setDraft] = useState<EditorPlan | null>(null);
  const [draftBaseUpdatedAt, setDraftBaseUpdatedAt] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(searchParams.get("picker") === "exercise");
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
        if (!plan) { setLoadError(tr("planNotFoundEditor")); return; }
        const base = toEditorPlan(plan);
        const stored = readStoredJson<StoredEditorDraft>(draftKey);
        const restored = stored?.plan?.days && stored.baseUpdatedAt ? stored : null;
        setBasePlan(base);
        setDraft(restored && !plansEqual(restored.plan, base) ? restored.plan : base);
        setDraftBaseUpdatedAt(restored?.baseUpdatedAt ?? base.updated_at);
        setSaveState(restored && !plansEqual(restored.plan, base) ? "restored" : "idle");
        const loadedDraft = restored && !plansEqual(restored.plan, base) ? restored.plan : base;
        const requestedDay = searchParams.get("day");
        setSelectedDayKey(loadedDraft.days.find((day) => day.id === requestedDay)?.clientKey ?? loadedDraft.days[0]?.clientKey ?? null);
      } catch (error) {
        if (current) setLoadError(userSafeError(error, tr("editorLoadFailed")));
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, [draftKey, params.planId, searchParams, tr, user]);

  const isDirty = Boolean(basePlan && draft && !plansEqual(basePlan, draft));
  const selectedDayIndex = draft?.days.findIndex((day) => day.clientKey === selectedDayKey) ?? -1;
  const selectedDay = selectedDayIndex >= 0 ? draft?.days[selectedDayIndex] ?? null : draft?.days[0] ?? null;
  const validationError = draft ? validatePlan(draft, tr) : null;
  const weekdayOptions = useMemo(() => weekDays.map((value) => ({
    value,
    label: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + weekDays.indexOf(value)))
  })), [locale]);

  useEffect(() => {
    if (!draft || !basePlan) return;
    if (plansEqual(draft, basePlan)) clearStoredValue(draftKey);
    else if (draftBaseUpdatedAt) storeJson(draftKey, { plan: draft, baseUpdatedAt: draftBaseUpdatedAt } satisfies StoredEditorDraft);
  }, [basePlan, draft, draftBaseUpdatedAt, draftKey]);

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
    const day: EditorDay = { clientKey: key, id: "", plan_id: draft.id, day_number: draft.days.length + 1, day_name: tr("workoutDayNumber", { count: draft.days.length + 1 }), weekday, notes: null, exercises: [] };
    change((current) => ({ ...current, days: [...current.days, day] }));
    setSelectedDayKey(key);
  }

  function removeDay(index: number) {
    if (!draft || draft.days.length <= 1) return;
    const target = draft.days[index];
    ask({ title: tr("removeNamedDay", { name: target.day_name }), description: tr("removeDayDescription"), confirmLabel: tr("removeDay"), variant: "destructive", onConfirm: () => {
      change((current) => ({ ...current, days: current.days.filter((_, itemIndex) => itemIndex !== index) }));
      setSelectedDayKey(draft.days[index - 1]?.clientKey ?? draft.days[index + 1]?.clientKey ?? null);
    } });
  }

  function addLibraryExercises(dayIndex: number, workouts: Workout[]) {
    change((current) => ({ ...current, days: current.days.map((day, index) => {
      if (index !== dayIndex) return day;
      const existing = new Set(day.exercises.map((exercise) => `${exercise.source_workout_id || exercise.workout_id || exercise.id}-${exercise.exercise_name}-${exercise.target_muscle || ""}`));
      const additions = workouts.filter((workout) => !existing.has(exerciseKey(workout))).map((workout) => exerciseFromLibrary(workout, day.id));
      return { ...day, exercises: [...day.exercises, ...additions] };
    }) }));
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
    ask({ title: tr("removeNamedExercise", { name: exercise.exercise_name || tr("thisExercise") }), description: tr("removeExerciseDescription"), confirmLabel: tr("removeExercise"), variant: "destructive", onConfirm: () => {
      change((current) => ({ ...current, days: current.days.map((day, index) => index === dayIndex ? { ...day, exercises: day.exercises.filter((_, itemIndex) => itemIndex !== exerciseIndex) } : day) }));
    } });
  }

  async function save(options: { navigate?: boolean } = {}): Promise<boolean> {
    if (!draft || !basePlan || !draftBaseUpdatedAt || !user?.id || validationError || saveState === "saving") return false;
    setSaveState("saving"); setSaveError(null);
    try {
      await saveWorkoutPlan(user.id, draft.id, toSavePlan(draft), draftBaseUpdatedAt);
      clearStoredValue(draftKey);
      setSaveState("saved");
      toast({ title: tr("planSaved"), description: tr("planSavedDescription") });
      if (options.navigate !== false) router.push(`/my-workout/plans/${draft.id}`);
      return true;
    } catch (error) {
      const message = userSafeError(error, tr("draftPreserved"));
      setSaveError(message); setSaveState("failed");
      toast({ title: tr("couldNotSavePlan"), description: message, variant: "error" });
      return false;
    }
  }

  const { request: requestNavigation, dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty: isDirty,
    applying: saveState === "saving",
    onApply: () => save({ navigate: false }),
    onDiscard: () => {
      clearStoredValue(draftKey);
      if (basePlan) setDraft(basePlan);
    },
    copy: {
      title: tr("unsavedTitle"),
      description: tr("unsavedDescription"),
      apply: tr("applyContinue"),
      discard: tr("discardContinue"),
      stay: tr("stay")
    }
  });

  function cancel() {
    requestNavigation(() => router.push(`/my-workout/plans/${params.planId}`));
  }

  if (loading) return <div className="space-y-4" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded-lg bg-muted" /><div className="h-96 animate-pulse rounded-2xl bg-muted" /></div>;
  if (loadError || !draft) return <ErrorState title={tr("editorUnavailable")} description={loadError || tr("editorLoadFallback")} fallbackHref="/my-workout/plans" fallbackLabel={tr("backToTrain")} />;

  return (
    <div className="space-y-6 pb-24" dir={dir}>
      <PageHeading title={`${tr("editPlanTitle")} · ${draft.name}`} description={tr("editorDescription")} action={<div className="flex flex-wrap gap-2"><Button asChild variant="ghost"><Link href={`/my-workout/plans/${draft.id}`}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("back")}</Link></Button><Button variant="outline" onClick={cancel}>{tr("cancel")}</Button></div>} />

      {saveState === "restored" ? <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">{tr("draftRestored")}</p><p className="text-muted-foreground">{tr("draftRestoredDescription")}</p></div></div> : null}

      <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2"><Label htmlFor="plan-name">{tr("planName")}</Label><Input id="plan-name" value={draft.name} onChange={(event) => patchPlan({ name: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="plan-goal">{tr("goal")}</Label><Input id="plan-goal" value={draft.goal ?? ""} onChange={(event) => patchPlan({ goal: event.target.value || null })} placeholder={tr("goalPlaceholder")} /></div>
        <div className="space-y-2"><Label htmlFor="plan-weeks">{tr("durationWeeks")}</Label><Input id="plan-weeks" type="number" min={1} max={104} value={draft.program_duration_weeks ?? ""} onChange={(event) => patchPlan({ program_duration_weeks: event.target.value ? Number(event.target.value) : null })} /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="plan-description">{tr("description")}</Label><textarea id="plan-description" className="min-h-24 w-full rounded-[14px] border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.description ?? ""} onChange={(event) => patchPlan({ description: event.target.value || null })} /></div>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
      <section className="space-y-3 lg:sticky lg:top-6" aria-labelledby="editor-days-heading">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="editor-days-heading" className="text-xl font-semibold">{tr("trainingDaysHeading")}</h2><p className="text-sm text-muted-foreground">{tr("selectDayToEdit")}</p></div><Button variant="outline" onClick={addDay} disabled={draft.days.length >= 7}><Plus className="h-4 w-4" /> {tr("addDay")}</Button></div>
        <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" role="tablist" aria-label={tr("workoutDays")}>
          {draft.days.map((day, index) => <div key={day.clientKey} className={`flex min-w-48 items-center gap-1 rounded-2xl border p-1 lg:min-w-0 ${day.clientKey === selectedDay?.clientKey ? "border-primary bg-primary/10" : "bg-card"}`}><button type="button" role="tab" aria-selected={day.clientKey === selectedDay?.clientKey} className="min-h-12 min-w-0 flex-1 rounded-xl px-3 text-start" onClick={() => setSelectedDayKey(day.clientKey)}><span className="block truncate font-semibold">{day.day_name}</span><span className="block text-xs text-muted-foreground">{weekdayOptions.find((option) => option.value === day.weekday)?.label ?? tr("unscheduled")}</span></button><Button type="button" variant="ghost" size="icon" aria-label={tr("moveUp", { name: day.day_name })} onClick={() => moveDay(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={tr("moveDown", { name: day.day_name })} onClick={() => moveDay(index, 1)} disabled={index === draft.days.length - 1}><ArrowDown className="h-4 w-4" /></Button></div>)}
        </div>
      </section>

      {selectedDay && selectedDayIndex >= 0 ? <Card><CardContent className="space-y-6 p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <div className="space-y-2"><Label htmlFor="day-name">{tr("dayName")}</Label><Input id="day-name" value={selectedDay.day_name} onChange={(event) => patchDay(selectedDayIndex, { day_name: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="day-weekday">{tr("weekday")}</Label><Select id="day-weekday" value={selectedDay.weekday ?? ""} onChange={(value) => patchDay(selectedDayIndex, { weekday: (value || null) as Weekday | null })} placeholder={tr("unscheduled")} options={weekdayOptions} /></div>
          <Button variant="ghost" className="text-destructive" onClick={() => removeDay(selectedDayIndex)} disabled={draft.days.length <= 1}><Trash2 className="h-4 w-4" /> {tr("removeDay")}</Button>
        </div>
        <div className="space-y-2"><Label htmlFor="day-notes">{tr("dayNotes")}</Label><Input id="day-notes" value={selectedDay.notes ?? ""} onChange={(event) => patchDay(selectedDayIndex, { notes: event.target.value || null })} placeholder={tr("dayNotesPlaceholder")} /></div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{tr("selectedExercises")}</h3><p className="text-sm text-muted-foreground">{tr("chooseThenEdit")}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{selectedDay.exercises.length}</Badge><Button variant="outline" onClick={() => setPickerOpen(true)}><Plus className="h-4 w-4" /> {tr("addExercises")}</Button></div></div>
          {selectedDay.exercises.map((exercise, exerciseIndex) => <div key={exercise.clientKey} className="rounded-2xl border bg-muted/20 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
              <div className="space-y-2 lg:col-span-2"><Label htmlFor={`exercise-name-${exercise.clientKey}`}>{tr("exerciseNumber", { count: exerciseIndex + 1 })}</Label><Input id={`exercise-name-${exercise.clientKey}`} value={exercise.exercise_name} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { exercise_name: event.target.value })} placeholder={tr("exerciseName")} /></div>
              <div className="space-y-2"><Label htmlFor={`muscle-${exercise.clientKey}`}>{tr("target")}</Label><Input id={`muscle-${exercise.clientKey}`} value={exercise.target_muscle ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { target_muscle: event.target.value || null })} placeholder={tr("targetPlaceholder")} /></div>
              <div className="space-y-2"><Label htmlFor={`equipment-${exercise.clientKey}`}>{tr("equipment")}</Label><Input id={`equipment-${exercise.clientKey}`} value={exercise.equipment ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { equipment: event.target.value || null })} /></div>
              <div className="space-y-2"><Label htmlFor={`sets-${exercise.clientKey}`}>{tr("sets")}</Label><Input id={`sets-${exercise.clientKey}`} type="number" min={1} value={exercise.sets ?? 3} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { sets: Number(event.target.value) || 0 })} /></div>
              <div className="space-y-2"><Label htmlFor={`reps-${exercise.clientKey}`}>{tr("reps")}</Label><Input id={`reps-${exercise.clientKey}`} value={exercise.reps ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { reps: event.target.value || null })} /></div>
              <div className="space-y-2"><Label htmlFor={`rest-${exercise.clientKey}`}>{tr("restSeconds")}</Label><Input id={`rest-${exercise.clientKey}`} type="number" min={0} value={exercise.rest_seconds ?? 75} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { rest_seconds: Number(event.target.value) || 0 })} /></div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-2"><Label htmlFor={`notes-${exercise.clientKey}`}>{tr("notes")}</Label><Input id={`notes-${exercise.clientKey}`} value={exercise.notes ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { notes: event.target.value || null })} /></div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={tr("moveUp", { name: exercise.exercise_name || tr("thisExercise") })} onClick={() => moveExercise(selectedDayIndex, exerciseIndex, -1)} disabled={exerciseIndex === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={tr("moveDown", { name: exercise.exercise_name || tr("thisExercise") })} onClick={() => moveExercise(selectedDayIndex, exerciseIndex, 1)} disabled={exerciseIndex === selectedDay.exercises.length - 1}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={tr("removeItem", { name: exercise.exercise_name || tr("thisExercise") })} onClick={() => removeExercise(selectedDayIndex, exerciseIndex)}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          </div>)}
          {!selectedDay.exercises.length ? <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed text-center"><div><Dumbbell className="mx-auto mb-2 h-5 w-5 text-muted-foreground" /><p className="font-medium">{tr("noExercisesYet")}</p><Button type="button" variant="ghost" className="mt-2 min-h-11" onClick={() => setPickerOpen(true)}>{tr("addExercises")}</Button></div></div> : null}
        </div>
      </CardContent></Card> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur sm:static sm:rounded-2xl sm:border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm"><p className="font-semibold">{saveState === "saving" ? tr("saving") : saveState === "saved" ? tr("saved") : isDirty ? tr("unsavedChanges") : tr("noUnsavedChanges")}</p>{validationError ? <p className="text-destructive">{validationError}</p> : saveError ? <p className="text-destructive">{saveError}</p> : <p className="text-muted-foreground">{tr("atomicSaveNotice")}</p>}</div>
          <div className="flex gap-2"><Button variant="outline" onClick={cancel}>{tr("cancel")}</Button><Button onClick={() => void save()} disabled={!isDirty || Boolean(validationError) || saveState === "saving"}>{saveState === "saved" ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saveState === "saving" ? tr("saving") : tr("saveChanges")}</Button></div>
        </div>
      </div>
      {selectedDay && selectedDayIndex >= 0 ? <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        dayName={selectedDay.day_name}
        existingKeys={selectedDay.exercises.map((exercise) => `${exercise.source_workout_id || exercise.workout_id || exercise.id}-${exercise.exercise_name}-${exercise.target_muscle || ""}`)}
        onAdd={(workouts) => addLibraryExercises(selectedDayIndex, workouts)}
      /> : null}
      {dialog}
      {unsavedDialog}
    </div>
  );
}
