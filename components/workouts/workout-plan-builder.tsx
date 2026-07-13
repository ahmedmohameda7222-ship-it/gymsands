"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ExercisePickerDialog, exerciseKey } from "@/components/workouts/exercise-picker-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { useUnsavedChangesGuard } from "@/lib/hooks/use-unsaved-changes-guard";
import { useTrainTranslation, type TrainKey } from "@/lib/i18n/train";
import { todayIso } from "@/lib/date-utils";
import { mergeUserFacingExerciseNote, userFacingExerciseNote } from "@/lib/workouts/train-visual";
import { clearStoredValue, readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";
import { createUserWorkoutPlan, weekDays } from "@/services/database/workout-plans";
import type { Weekday, Workout } from "@/types";

type BuilderDay = { dayName: string; weekday: Weekday | null; notes: string; exercises: Workout[] };
type BuilderDraft = { planName: string; goal: string; description: string; durationWeeks: number | null; sessionMinutes: number | null; days: BuilderDay[] };

type TrainTranslator = (key: TrainKey, values?: Record<string, string | number>) => string;

function createInitialDraft(tr: TrainTranslator): BuilderDraft {
  return {
  planName: tr("myWorkout"),
  goal: "",
  description: "",
  durationWeeks: 8,
  sessionMinutes: 45,
  days: [
    { dayName: tr("workoutDayNumber", { count: 1 }), weekday: "Monday", notes: "", exercises: [] },
    { dayName: tr("workoutDayNumber", { count: 2 }), weekday: "Wednesday", notes: "", exercises: [] },
    { dayName: tr("workoutDayNumber", { count: 3 }), weekday: "Friday", notes: "", exercises: [] }
  ]
  };
}

function identity(workout: Workout) {
  return `${workout.id}-${workout.name}-${workout.target_muscle}`;
}

function withDefaults(workout: Workout): Workout {
  return { ...workout, sets: workout.sets ?? 3, reps: workout.reps ?? "8-12", rest_seconds: workout.rest_seconds ?? 75 };
}

export function WorkoutPlanBuilder({ onSaved }: { loadActivePlan?: boolean; onSaved?: () => void | Promise<void> }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dir, locale, tr } = useTrainTranslation();
  const initialDraft = useMemo(() => createInitialDraft(tr), [tr]);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<BuilderDraft>(() => initialDraft);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const draftKey = useMemo(() => workoutStorageKey(["workout-plan-builder", user?.id ?? "anonymous"]), [user?.id]);
  const weekdayOptions = useMemo(() => weekDays.map((value) => ({
    value,
    label: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + weekDays.indexOf(value)))
  })), [locale]);

  useEffect(() => {
    const stored = readStoredJson<BuilderDraft>(draftKey);
    if (stored) setDraft({ ...initialDraft, ...stored, description: stored.description ?? "" });
    setHydrated(true);
  }, [draftKey, initialDraft]);

  useEffect(() => { if (hydrated) storeJson(draftKey, draft); }, [draft, draftKey, hydrated]);

  const totalExercises = draft.days.reduce((sum, day) => sum + day.exercises.length, 0);
  const activeDay = draft.days[activeDayIndex] ?? draft.days[0];
  const planDetailsValid = Boolean(draft.planName.trim());
  const scheduleValid = Boolean(draft.days.length && draft.days.every((day) => day.dayName.trim() && day.weekday) && new Set(draft.days.map((day) => day.weekday)).size === draft.days.length);
  const basicsValid = planDetailsValid && scheduleValid;
  const exerciseStepValid = draft.days.every((day) => day.exercises.length > 0);

  function patchDraft(patch: Partial<BuilderDraft>) { setDraft((current) => ({ ...current, ...patch })); }
  function patchDay(index: number, patch: Partial<BuilderDay>) { setDraft((current) => ({ ...current, days: current.days.map((day, itemIndex) => itemIndex === index ? { ...day, ...patch } : day) })); }
  function patchExercise(dayIndex: number, exerciseIndex: number, patch: Partial<Workout>) { setDraft((current) => ({ ...current, days: current.days.map((day, itemIndex) => itemIndex === dayIndex ? { ...day, exercises: day.exercises.map((exercise, index) => index === exerciseIndex ? { ...exercise, ...patch } : exercise) } : day) })); }

  function addDay() {
    if (draft.days.length >= 7) return;
    const used = new Set(draft.days.map((day) => day.weekday));
    const weekday = weekDays.find((day) => !used.has(day)) ?? null;
    patchDraft({ days: [...draft.days, { dayName: tr("workoutDayNumber", { count: draft.days.length + 1 }), weekday, notes: "", exercises: [] }] });
    setActiveDayIndex(draft.days.length);
  }

  function removeDay(index: number) {
    if (draft.days.length <= 1) return;
    patchDraft({ days: draft.days.filter((_, itemIndex) => itemIndex !== index) });
    setActiveDayIndex((current) => Math.max(0, Math.min(current, draft.days.length - 2)));
  }

  function moveDay(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= draft.days.length) return;
    const days = [...draft.days];
    const [day] = days.splice(index, 1);
    days.splice(next, 0, day);
    patchDraft({ days });
    setActiveDayIndex(next);
  }

  function addExercises(workouts: Workout[]) {
    const existing = new Set(activeDay.exercises.map(exerciseKey));
    patchDay(activeDayIndex, { exercises: [...activeDay.exercises, ...workouts.filter((workout) => !existing.has(exerciseKey(workout))).map(withDefaults)] });
  }

  function moveExercise(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= activeDay.exercises.length) return;
    const exercises = [...activeDay.exercises];
    const [exercise] = exercises.splice(index, 1);
    exercises.splice(next, 0, exercise);
    patchDay(activeDayIndex, { exercises });
  }

  function removeExercise(index: number) {
    patchDay(activeDayIndex, { exercises: activeDay.exercises.filter((_, itemIndex) => itemIndex !== index) });
  }

  async function savePlan(options: { navigate?: boolean } = {}): Promise<boolean> {
    if (!user?.id || !basicsValid || !exerciseStepValid || saving) return false;
    setSaving(true);
    try {
      await createUserWorkoutPlan({
        userId: user.id,
        planName: draft.planName,
        goal: draft.goal || null,
        description: draft.description || null,
        programDurationWeeks: draft.durationWeeks,
        sessionDurationMinutes: draft.sessionMinutes,
        startDate: todayIso(),
        days: draft.days
      });
      clearStoredValue(draftKey);
      toast({ title: tr("planCreated"), description: tr("planCreatedDescription", { name: draft.planName }) });
      if (options.navigate !== false) await onSaved?.();
      return true;
    } catch (error) {
      toast({ title: tr("planCreateFailed"), description: userSafeError(error, tr("planCreateDraftPreserved")), variant: "error" });
      return false;
    } finally { setSaving(false); }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const { dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty,
    applying: saving,
    onApply: () => savePlan({ navigate: false }),
    onDiscard: () => {
      clearStoredValue(draftKey);
      setDraft(initialDraft);
    },
    copy: {
      title: tr("unsavedTitle"),
      description: tr("unsavedDescription"),
      apply: tr("applyContinue"),
      discard: tr("discardContinue"),
      stay: tr("stay")
    }
  });


  return (
    <div className="space-y-6" dir={dir} data-train-builder>
      <ol className="mx-auto grid w-full max-w-4xl grid-cols-3 gap-2" aria-label={tr("builderProgress")}>
        {[tr("planDetailsStep"), tr("trainingDaysStep"), tr("reviewStep")].map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const complete = step > number;
          return (
            <li key={label} data-step-state={complete ? "complete" : active ? "current" : "upcoming"} className={`rounded-xl border px-2.5 py-2 sm:px-3 ${active ? "border-primary bg-primary/10" : complete ? "border-success/40 bg-success/10" : "border-border/70 bg-card"}`}>
              <span className="flex items-center gap-2 text-xs font-semibold sm:text-sm">{complete ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-success-foreground"><Check className="h-3.5 w-3.5" /></span> : <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{number}</span>}<span className="line-clamp-2">{label}</span></span>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="mx-auto w-full max-w-5xl space-y-4" data-builder-step="details">
          <Card><CardContent className="grid gap-4 p-5 sm:p-6 md:grid-cols-3">
            <div className="space-y-2 md:col-span-3"><Label htmlFor="builder-name">{tr("planName")}</Label><Input id="builder-name" value={draft.planName} onChange={(event) => patchDraft({ planName: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="builder-goal">{tr("goal")}</Label><Input id="builder-goal" value={draft.goal} onChange={(event) => patchDraft({ goal: event.target.value })} placeholder={tr("goalPlaceholder")} /></div>
            <div className="space-y-2"><Label htmlFor="builder-weeks">{tr("programDuration")}</Label><Input id="builder-weeks" type="number" min={1} max={104} value={draft.durationWeeks ?? ""} onChange={(event) => patchDraft({ durationWeeks: event.target.value ? Number(event.target.value) : null })} /><p className="text-xs text-muted-foreground">{tr("weeks")}</p></div>
            <div className="space-y-2"><Label htmlFor="builder-minutes">{tr("sessionDuration")}</Label><Input id="builder-minutes" type="number" min={5} max={300} value={draft.sessionMinutes ?? ""} onChange={(event) => patchDraft({ sessionMinutes: event.target.value ? Number(event.target.value) : null })} /><p className="text-xs text-muted-foreground">{tr("minutes")}</p></div>
            <div className="space-y-2 md:col-span-3"><Label htmlFor="builder-description">{tr("descriptionOptional")}</Label><textarea id="builder-description" value={draft.description} onChange={(event) => patchDraft({ description: event.target.value })} className="min-h-20 w-full resize-y rounded-[14px] border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          </CardContent></Card>
          {!planDetailsValid ? <p className="text-sm text-destructive">{tr("enterPlanName")}</p> : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6" data-builder-step="days">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">{tr("trainingDaysHeading")}</h2><p className="text-sm text-muted-foreground">{tr("trainingDaysDescription")}</p></div><Button variant="outline" className="min-h-11" onClick={addDay} disabled={draft.days.length >= 7}><Plus className="h-4 w-4" /> {tr("addDay")}</Button></div>

          <div className="grid grid-flow-col auto-cols-[minmax(180px,1fr)] gap-2 overflow-x-auto pb-2" role="tablist" aria-label={tr("trainingDaysHeading")} data-builder-day-tabs>
            {draft.days.map((day, index) => {
              const selected = index === activeDayIndex;
              const incomplete = !day.exercises.length;
              return <button key={`${day.weekday}-${index}`} type="button" role="tab" aria-selected={selected} onClick={() => setActiveDayIndex(index)} className={`min-h-16 rounded-2xl border px-4 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/20" : incomplete ? "border-warning/50 bg-warning/5" : "border-border/70 bg-card"}`}><span className="block truncate font-semibold">{day.dayName}</span><span className={`mt-1 block text-xs font-medium ${incomplete ? "text-warning-foreground" : "text-muted-foreground"}`}>{incomplete ? tr("noExercisesAdded") : tr("exercises", { count: day.exercises.length })}</span></button>;
            })}
          </div>

          <Card data-day-configuration><CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
            <div className="space-y-2"><Label htmlFor="active-builder-day-name">{tr("dayName")}</Label><Input id="active-builder-day-name" value={activeDay.dayName} onChange={(event) => patchDay(activeDayIndex, { dayName: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="active-builder-weekday">{tr("weekday")}</Label><Select id="active-builder-weekday" value={activeDay.weekday ?? ""} onChange={(value) => patchDay(activeDayIndex, { weekday: value as Weekday })} options={weekdayOptions} /></div>
            <div className="flex flex-wrap gap-1 lg:justify-end"><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveUp", { name: activeDay.dayName })} title={tr("moveUp", { name: activeDay.dayName })} onClick={() => moveDay(activeDayIndex, -1)} disabled={activeDayIndex === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveDown", { name: activeDay.dayName })} title={tr("moveDown", { name: activeDay.dayName })} onClick={() => moveDay(activeDayIndex, 1)} disabled={activeDayIndex === draft.days.length - 1}><ArrowDown className="h-4 w-4" /></Button><span className="mx-1 hidden w-px bg-border sm:block" aria-hidden="true" /><Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-destructive" aria-label={tr("removeItem", { name: activeDay.dayName })} title={tr("removeItem", { name: activeDay.dayName })} onClick={() => removeDay(activeDayIndex)} disabled={draft.days.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
            <div className="space-y-2 lg:col-span-3"><Label htmlFor="active-builder-day-notes">{tr("dayNotes")}</Label><Input id="active-builder-day-notes" value={activeDay.notes} onChange={(event) => patchDay(activeDayIndex, { notes: event.target.value })} placeholder={tr("dayNotesPlaceholder")} /></div>
            {!activeDay.exercises.length ? <p className="text-sm font-medium text-destructive lg:col-span-3">{activeDay.dayName}: {tr("addExercisesToContinue")}</p> : null}
          </CardContent></Card>

          <section className="space-y-3" aria-labelledby="selected-exercises-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="selected-exercises-heading" className="text-lg font-semibold">{tr("selectedExercises")}</h3><p className="text-sm text-muted-foreground">{tr("prescriptionHelp")}</p></div><Button type="button" variant="outline" className="min-h-11" onClick={() => setPickerOpen(true)}><Plus className="h-4 w-4" /> {tr("addExercises")}</Button></div>
            {!activeDay.exercises.length ? <div className="rounded-2xl border border-dashed p-6 text-center"><p className="font-medium">{tr("noExercisesYet")}</p><p className="mt-1 text-sm text-muted-foreground">{tr("chooseExercises")}</p></div> : null}
            <div className="space-y-3">
              {activeDay.exercises.map((exercise, index) => (
                <article key={`${identity(exercise)}-${index}`} className="rounded-2xl border border-border/70 bg-card p-4" data-exercise-prescription>
                  <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="min-w-0"><p className="font-semibold">{index + 1}. {exercise.name}</p><p className="mt-1 text-sm text-muted-foreground">{exercise.target_muscle} · {exercise.equipment}</p></div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-[90px_120px_120px_minmax(180px,1fr)_auto] xl:items-end">
                    <div className="space-y-2"><Label htmlFor={`builder-sets-${index}`}>{tr("sets")}</Label><Input id={`builder-sets-${index}`} type="number" min={1} value={exercise.sets ?? 3} onChange={(event) => patchExercise(activeDayIndex, index, { sets: Number(event.target.value) || 0 })} /></div>
                    <div className="space-y-2"><Label htmlFor={`builder-reps-${index}`}>{tr("reps")}</Label><Input id={`builder-reps-${index}`} value={exercise.reps ?? ""} onChange={(event) => patchExercise(activeDayIndex, index, { reps: event.target.value || null })} /></div>
                    <div className="space-y-2"><Label htmlFor={`builder-rest-${index}`}>{tr("restSeconds")}</Label><Input id={`builder-rest-${index}`} type="number" min={0} value={exercise.rest_seconds ?? 75} onChange={(event) => patchExercise(activeDayIndex, index, { rest_seconds: Number(event.target.value) || 0 })} /></div>
                    <div className="space-y-2 sm:col-span-3 xl:col-span-1"><Label htmlFor={`builder-exercise-notes-${index}`}>{tr("notes")}</Label><Input id={`builder-exercise-notes-${index}`} value={userFacingExerciseNote(exercise.notes)} onChange={(event) => patchExercise(activeDayIndex, index, { notes: mergeUserFacingExerciseNote(exercise.notes, event.target.value) })} /></div>
                    <div className="flex gap-1 sm:col-span-3 xl:col-span-1 xl:justify-end"><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveUp", { name: exercise.name })} title={tr("moveUp", { name: exercise.name })} onClick={() => moveExercise(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveDown", { name: exercise.name })} title={tr("moveDown", { name: exercise.name })} onClick={() => moveExercise(index, 1)} disabled={index === activeDay.exercises.length - 1}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-destructive" aria-label={tr("removeItem", { name: exercise.name })} title={tr("removeItem", { name: exercise.name })} onClick={() => removeExercise(index)}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {!scheduleValid ? <p className="text-sm text-destructive">{tr("uniqueWeekdayError")}</p> : null}
          {!exerciseStepValid ? <div className="space-y-1 rounded-2xl border border-destructive/25 bg-destructive/5 p-3">{draft.days.filter((day) => !day.exercises.length).map((day) => <p key={day.dayName} className="text-sm font-medium text-destructive">{day.dayName}: {tr("addExercisesToContinue")}</p>)}</div> : null}
        </div>
      ) : null}

      {step === 3 ? <div className="space-y-4">
        <Card className="border-primary/30 bg-primary/5"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{tr("reviewStep")}</p><h2 className="mt-1 text-2xl font-semibold">{draft.planName}</h2>{draft.description ? <p className="mt-2 text-sm text-muted-foreground">{draft.description}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Badge>{tr("trainingDays", { count: draft.days.length })}</Badge><Badge variant="outline">{tr("exercises", { count: totalExercises })}</Badge>{draft.durationWeeks ? <Badge variant="outline">{tr("programWeeks", { count: draft.durationWeeks })}</Badge> : null}{draft.sessionMinutes ? <Badge variant="outline">{tr("aboutMinutes", { count: draft.sessionMinutes })}</Badge> : null}{draft.goal ? <Badge variant="outline">{draft.goal}</Badge> : null}</div></CardContent></Card>
        <div className="grid gap-3 md:grid-cols-2">{draft.days.map((day) => <Card key={`${day.weekday}-${day.dayName}`}><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{day.weekday ? new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + weekDays.indexOf(day.weekday))) : tr("unscheduled")}</p><h3 className="font-semibold">{day.dayName}</h3>{day.notes ? <p className="mt-1 text-sm text-muted-foreground">{day.notes}</p> : null}</div><Badge variant="outline">{tr("exercises", { count: day.exercises.length })}</Badge></div><ol className="mt-3 space-y-2">{day.exercises.map((exercise, index) => <li key={`${identity(exercise)}-${index}`} className="flex justify-between gap-3 text-sm"><span>{index + 1}. {exercise.name}{userFacingExerciseNote(exercise.notes) ? <span className="block text-xs text-muted-foreground">{userFacingExerciseNote(exercise.notes)}</span> : null}</span><span className="text-end text-muted-foreground">{exercise.sets ?? 3} × {exercise.reps ?? "8–12"}<span className="block text-xs">{tr("secondsRest", { count: exercise.rest_seconds ?? 75 })}</span></span></li>)}</ol></CardContent></Card>)}</div>
        <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">{tr("atomicCreateNotice")}</div>
      </div> : null}

      <div className="sticky bottom-[var(--train-sticky-footer-bottom)] z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:items-center sm:justify-between sm:rounded-2xl sm:border sm:px-4 lg:bottom-[var(--desktop-train-sticky-footer-bottom)]" data-train-sticky-footer>
        <Button variant="outline" className="min-h-11" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("back")}</Button>
        {step < 3 ? <Button className="min-h-11" onClick={() => setStep((current) => Math.min(3, current + 1))} disabled={step === 1 ? !planDetailsValid : !scheduleValid || !exerciseStepValid}>{tr("continue")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button> : <Button className="min-h-11" onClick={() => void savePlan()} disabled={saving || !basicsValid || !exerciseStepValid}>{saving ? tr("savingPlan") : tr("savePlan")}</Button>}
      </div>
      <ExercisePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} dayName={activeDay.dayName} existingKeys={activeDay.exercises.map(exerciseKey)} onAdd={addExercises} />
      {unsavedDialog}
    </div>
  );
}
