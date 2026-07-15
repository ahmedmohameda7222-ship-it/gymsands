"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ExercisePickerDialog, exerciseKey } from "@/components/workouts/exercise-picker-dialog";
import { TrainStickyFooter } from "@/components/workouts/train-ui";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
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
  const [validationAttempted, setValidationAttempted] = useState(false);
  const validationSummaryRef = useRef<HTMLDivElement>(null);
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

  function continueToNextStep() {
    const valid = step === 1 ? planDetailsValid : step === 2 ? scheduleValid && exerciseStepValid : true;
    if (!valid) {
      setValidationAttempted(true);
      window.requestAnimationFrame(() => validationSummaryRef.current?.focus());
      return;
    }
    setValidationAttempted(false);
    setStep((current) => Math.min(3, current + 1));
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
      <ol className="mx-auto grid min-h-14 w-full max-w-4xl grid-cols-3 overflow-hidden rounded-2xl border border-border/80 bg-card" aria-label={tr("builderProgress")}>
        {[tr("planDetailsStep"), tr("trainingDaysStep"), tr("reviewStep")].map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const complete = step > number;
          return (
            <li key={label} aria-current={active ? "step" : undefined} data-step-state={complete ? "complete" : active ? "current" : "upcoming"} className={`flex items-center border-e border-border/80 px-2.5 py-2 last:border-e-0 sm:px-3 ${active ? "bg-primary/10" : complete ? "bg-success/10" : "bg-card"}`}>
              <span className="flex items-center gap-2 text-xs font-semibold sm:text-sm">{complete ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-success-foreground"><Check className="h-3.5 w-3.5" /></span> : <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{number}</span>}<span className="line-clamp-2">{label}</span></span>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="mx-auto w-full max-w-5xl space-y-4" data-builder-step="details">
          <Card><CardContent className="grid gap-5 p-4 sm:p-6 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label htmlFor="builder-name">{tr("planName")}</Label><Input id="builder-name" className="min-h-12" value={draft.planName} onChange={(event) => patchDraft({ planName: event.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="builder-goal">{tr("goal")}</Label><Input id="builder-goal" className="min-h-12" value={draft.goal} onChange={(event) => patchDraft({ goal: event.target.value })} placeholder={tr("goalPlaceholder")} /></div>
            <div className="space-y-2"><Label htmlFor="builder-weeks">{tr("programDuration")}</Label><Input id="builder-weeks" type="number" min={1} max={104} value={draft.durationWeeks ?? ""} onChange={(event) => patchDraft({ durationWeeks: event.target.value ? Number(event.target.value) : null })} /><p className="text-xs text-muted-foreground">{tr("weeks")}</p></div>
            <div className="space-y-2"><Label htmlFor="builder-minutes">{tr("sessionDuration")}</Label><Input id="builder-minutes" type="number" min={5} max={300} value={draft.sessionMinutes ?? ""} onChange={(event) => patchDraft({ sessionMinutes: event.target.value ? Number(event.target.value) : null })} /><p className="text-xs text-muted-foreground">{tr("minutes")}</p></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="builder-description">{tr("descriptionOptional")}</Label><textarea id="builder-description" value={draft.description} onChange={(event) => patchDraft({ description: event.target.value })} className="min-h-28 w-full resize-y rounded-xl border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          </CardContent></Card>
          {validationAttempted && !planDetailsValid ? <div ref={validationSummaryRef} tabIndex={-1} role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{tr("enterPlanName")}</div> : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6" data-builder-step="days">
          <div><h2 className="text-xl font-semibold">{tr("trainingDaysHeading")}</h2><p className="text-sm text-muted-foreground">{tr("trainingDaysDescription")}</p></div>

          <div className="grid grid-flow-col auto-cols-[240px] gap-2 overflow-x-auto pb-2" aria-label={tr("trainingDaysHeading")} data-builder-day-tabs>
            {draft.days.map((day, index) => {
              const selected = index === activeDayIndex;
              const incomplete = !day.exercises.length;
              return <button key={`${day.weekday}-${index}`} type="button" aria-pressed={selected} onClick={() => setActiveDayIndex(index)} className={`min-h-[72px] rounded-2xl border px-4 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/20" : validationAttempted && incomplete ? "border-warning/50 bg-warning/5" : "border-border/70 bg-card"}`}><span className="block truncate font-semibold">{day.dayName}</span><span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{incomplete ? tr("incomplete") : <><Check className="h-3.5 w-3.5 text-success" />{tr("complete")}</>}</span><span className="ms-1 text-xs text-muted-foreground">· {tr("exercises", { count: day.exercises.length })}</span></button>;
            })}
            <Button type="button" variant="outline" className="min-h-[72px] w-36 border-dashed" onClick={addDay} disabled={draft.days.length >= 7}><Plus className="h-4 w-4" /> {tr("addDay")}</Button>
          </div>

          <Card data-day-configuration><CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
            <div className="space-y-2"><Label htmlFor="active-builder-day-name">{tr("dayName")}</Label><Input id="active-builder-day-name" value={activeDay.dayName} onChange={(event) => patchDay(activeDayIndex, { dayName: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="active-builder-weekday">{tr("weekday")}</Label><Select id="active-builder-weekday" value={activeDay.weekday ?? ""} onChange={(value) => patchDay(activeDayIndex, { weekday: value as Weekday })} options={weekdayOptions} /></div>
            <div className="flex items-center justify-end gap-1"><span className="grid h-11 w-11 place-items-center text-muted-foreground" aria-hidden="true"><GripVertical className="h-5 w-5" /></span><ActionMenu label={`${tr("moreActions")}: ${activeDay.dayName}`} visibleLabel={tr("moreActions")} icon={<MoreHorizontal className="h-4 w-4" />}><ActionMenuItem onSelect={() => moveDay(activeDayIndex, -1)} disabled={activeDayIndex === 0}><ArrowUp className="me-2 inline h-4 w-4" />{tr("moveUp", { name: activeDay.dayName })}</ActionMenuItem><ActionMenuItem onSelect={() => moveDay(activeDayIndex, 1)} disabled={activeDayIndex === draft.days.length - 1}><ArrowDown className="me-2 inline h-4 w-4" />{tr("moveDown", { name: activeDay.dayName })}</ActionMenuItem><ActionMenuItem destructive onSelect={() => removeDay(activeDayIndex)} disabled={draft.days.length <= 1}><Trash2 className="me-2 inline h-4 w-4" />{tr("removeItem", { name: activeDay.dayName })}</ActionMenuItem></ActionMenu></div>
            <div className="space-y-2 lg:col-span-3"><Label htmlFor="active-builder-day-notes">{tr("dayNotes")}</Label><Input id="active-builder-day-notes" value={activeDay.notes} onChange={(event) => patchDay(activeDayIndex, { notes: event.target.value })} placeholder={tr("dayNotesPlaceholder")} /></div>
            {validationAttempted && !activeDay.exercises.length ? <p className="text-sm font-medium text-destructive lg:col-span-3">{activeDay.dayName}: {tr("addExercisesToContinue")}</p> : null}
          </CardContent></Card>

          <section className="space-y-3" aria-labelledby="selected-exercises-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="selected-exercises-heading" className="text-lg font-semibold">{tr("selectedExercises")}</h3><p className="text-sm text-muted-foreground">{tr("prescriptionHelp")}</p></div><Button type="button" variant="outline" className="min-h-11" onClick={() => setPickerOpen(true)}><Plus className="h-4 w-4" /> {tr("addExercises")}</Button></div>
            {!activeDay.exercises.length ? <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed p-6 text-center"><div><p className="font-medium">{tr("noExercisesYet")}</p><p className="mt-1 text-sm text-muted-foreground">{tr("chooseExercisesForDay", { day: activeDay.dayName })}</p><Button type="button" variant="outline" className="mt-4 min-h-12" onClick={() => setPickerOpen(true)}><Plus className="h-4 w-4" />{tr("addExercises")}</Button></div></div> : null}
            <div className="space-y-3">
              {activeDay.exercises.map((exercise, index) => (
                <article key={`${identity(exercise)}-${index}`} className="rounded-2xl border border-border/70 bg-card p-4" data-exercise-prescription>
                  <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="min-w-0"><p className="font-semibold">{index + 1}. {exercise.name}</p><p className="mt-1 text-sm text-muted-foreground">{exercise.target_muscle} · {exercise.equipment}</p></div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 xl:grid-cols-[88px_112px_112px_minmax(180px,1fr)_132px] xl:items-end">
                    <div className="space-y-2"><Label htmlFor={`builder-sets-${index}`}>{tr("sets")}</Label><Input id={`builder-sets-${index}`} type="number" min={1} value={exercise.sets ?? 3} onChange={(event) => patchExercise(activeDayIndex, index, { sets: Number(event.target.value) || 0 })} /></div>
                    <div className="space-y-2"><Label htmlFor={`builder-reps-${index}`}>{tr("reps")}</Label><Input id={`builder-reps-${index}`} value={exercise.reps ?? ""} onChange={(event) => patchExercise(activeDayIndex, index, { reps: event.target.value || null })} /></div>
                    <div className="space-y-2"><Label htmlFor={`builder-rest-${index}`}>{tr("restSeconds")}</Label><Input id={`builder-rest-${index}`} type="number" min={0} value={exercise.rest_seconds ?? 75} onChange={(event) => patchExercise(activeDayIndex, index, { rest_seconds: Number(event.target.value) || 0 })} /></div>
                    <div className="col-span-3 space-y-2 xl:col-span-1"><Label htmlFor={`builder-exercise-notes-${index}`}>{tr("notes")}</Label><Input id={`builder-exercise-notes-${index}`} value={userFacingExerciseNote(exercise.notes)} onChange={(event) => patchExercise(activeDayIndex, index, { notes: mergeUserFacingExerciseNote(exercise.notes, event.target.value) })} /></div>
                    <div className="col-span-3 flex gap-1 xl:col-span-1 xl:justify-end"><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveUp", { name: exercise.name })} title={tr("moveUp", { name: exercise.name })} onClick={() => moveExercise(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveDown", { name: exercise.name })} title={tr("moveDown", { name: exercise.name })} onClick={() => moveExercise(index, 1)} disabled={index === activeDay.exercises.length - 1}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-destructive" aria-label={tr("removeItem", { name: exercise.name })} title={tr("removeItem", { name: exercise.name })} onClick={() => removeExercise(index)}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {validationAttempted && (!scheduleValid || !exerciseStepValid) ? <div ref={validationSummaryRef} tabIndex={-1} role="alert" className="space-y-1 rounded-2xl border border-destructive/25 bg-destructive/5 p-3">{!scheduleValid ? <p className="text-sm font-medium text-destructive">{tr("uniqueWeekdayError")}</p> : null}{draft.days.filter((day) => !day.exercises.length).map((day) => <p key={day.dayName} className="text-sm font-medium text-destructive">{day.dayName}: {tr("addExercisesToContinue")}</p>)}</div> : null}
        </div>
      ) : null}

      {step === 3 ? <div className="space-y-4" data-builder-step="review">
        <Card className="border-primary/30 bg-primary/5"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{tr("reviewStep")}</p><h2 className="mt-1 text-2xl font-semibold">{draft.planName}</h2>{draft.description ? <p className="mt-2 text-sm text-muted-foreground">{draft.description}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Badge>{tr("trainingDays", { count: draft.days.length })}</Badge><Badge variant="outline">{tr("exercises", { count: totalExercises })}</Badge>{draft.durationWeeks ? <Badge variant="outline">{tr("programWeeks", { count: draft.durationWeeks })}</Badge> : null}{draft.sessionMinutes ? <Badge variant="outline">{tr("aboutMinutes", { count: draft.sessionMinutes })}</Badge> : null}{draft.goal ? <Badge variant="outline">{draft.goal}</Badge> : null}</div></CardContent></Card>
        <div className="grid gap-3 md:grid-cols-2">{draft.days.map((day) => <Card key={`${day.weekday}-${day.dayName}`}><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{day.weekday ? new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + weekDays.indexOf(day.weekday))) : tr("unscheduled")}</p><h3 className="font-semibold">{day.dayName}</h3>{day.notes ? <p className="mt-1 text-sm text-muted-foreground">{day.notes}</p> : null}</div><Badge variant="outline">{tr("exercises", { count: day.exercises.length })}</Badge></div><ol className="mt-3 space-y-2">{day.exercises.map((exercise, index) => <li key={`${identity(exercise)}-${index}`} className="flex justify-between gap-3 text-sm"><span>{index + 1}. {exercise.name}{userFacingExerciseNote(exercise.notes) ? <span className="block text-xs text-muted-foreground">{userFacingExerciseNote(exercise.notes)}</span> : null}</span><span className="text-end text-muted-foreground">{exercise.sets ?? 3} × {exercise.reps ?? "8–12"}<span className="block text-xs">{tr("secondsRest", { count: exercise.rest_seconds ?? 75 })}</span></span></li>)}</ol></CardContent></Card>)}</div>
        <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">{tr("atomicCreateNotice")}</div>
      </div> : null}

      <TrainStickyFooter className="max-w-[1120px]">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div>{step > 1 ? <Button variant="outline" className="min-h-[52px] w-full sm:min-h-11 sm:w-auto" onClick={() => { setValidationAttempted(false); setStep((current) => Math.max(1, current - 1)); }}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("back")}</Button> : null}</div>
          <p className="text-center text-sm font-medium text-muted-foreground">{tr("stepOf", { step, total: 3 })}</p>
          <div className="sm:flex sm:justify-end">{step < 3 ? <Button className="min-h-[52px] w-full sm:min-h-11 sm:w-auto" onClick={continueToNextStep}>{tr("continue")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button> : <Button className="min-h-[52px] w-full sm:min-h-11 sm:w-auto" onClick={() => void savePlan()} disabled={saving || !basicsValid || !exerciseStepValid}>{saving ? tr("savingPlan") : tr("savePlan")}</Button>}</div>
        </div>
      </TrainStickyFooter>
      <ExercisePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} dayName={activeDay.dayName} existingKeys={activeDay.exercises.map(exerciseKey)} onAdd={addExercises} />
      {unsavedDialog}
    </div>
  );
}
