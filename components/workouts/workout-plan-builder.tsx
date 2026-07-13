"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Dumbbell, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select-field";
import { CardGridSkeleton } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { clearStoredValue, readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";
import { getWorkouts } from "@/services/database/workout-library";
import { createUserWorkoutPlan, weekDays } from "@/services/database/workout-plans";
import type { Weekday, Workout } from "@/types";

type BuilderDay = { dayName: string; weekday: Weekday | null; notes: string; exercises: Workout[] };
type BuilderDraft = { planName: string; goal: string; durationWeeks: number | null; sessionMinutes: number | null; days: BuilderDay[] };

const initialDraft: BuilderDraft = {
  planName: "My workout plan",
  goal: "",
  durationWeeks: 8,
  sessionMinutes: 45,
  days: [
    { dayName: "Full body A", weekday: "Monday", notes: "", exercises: [] },
    { dayName: "Full body B", weekday: "Wednesday", notes: "", exercises: [] },
    { dayName: "Full body C", weekday: "Friday", notes: "", exercises: [] }
  ]
};

function identity(workout: Workout) {
  return `${workout.id}-${workout.name}-${workout.target_muscle}`;
}

function withDefaults(workout: Workout): Workout {
  return { ...workout, sets: workout.sets ?? 3, reps: workout.reps ?? "8-12", rest_seconds: workout.rest_seconds ?? 75 };
}

export function WorkoutPlanBuilder({ onSaved }: { loadActivePlan?: boolean; onSaved?: () => void | Promise<void> }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<BuilderDraft>(initialDraft);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Workout[]>([]);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const draftKey = useMemo(() => workoutStorageKey(["workout-plan-builder", user?.id ?? "anonymous"]), [user?.id]);

  useEffect(() => {
    const stored = readStoredJson<BuilderDraft>(draftKey);
    if (stored) setDraft(stored);
    setHydrated(true);
  }, [draftKey]);

  useEffect(() => { if (hydrated) storeJson(draftKey, draft); }, [draft, draftKey, hydrated]);

  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(initialDraft)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  useEffect(() => {
    if (step !== 2) return;
    let current = true;
    const timer = window.setTimeout(() => {
      setLoadingResults(true);
      setResultsError(null);
      getWorkouts(query.trim(), {}, 0)
        .then((items) => { if (current) setResults(items.slice(0, 36).map(withDefaults)); })
        .catch((error) => { if (current) { const message = userSafeError(error, "Try again in a moment."); setResults([]); setResultsError(message); toast({ title: "Exercise library unavailable", description: message, variant: "error" }); } })
        .finally(() => { if (current) setLoadingResults(false); });
    }, 220);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, step, toast]);

  const totalExercises = draft.days.reduce((sum, day) => sum + day.exercises.length, 0);
  const activeDay = draft.days[activeDayIndex] ?? draft.days[0];
  const basicsValid = Boolean(draft.planName.trim() && draft.days.length && draft.days.every((day) => day.dayName.trim() && day.weekday) && new Set(draft.days.map((day) => day.weekday)).size === draft.days.length);
  const exerciseStepValid = draft.days.every((day) => day.exercises.length > 0);

  function patchDraft(patch: Partial<BuilderDraft>) { setDraft((current) => ({ ...current, ...patch })); }
  function patchDay(index: number, patch: Partial<BuilderDay>) { setDraft((current) => ({ ...current, days: current.days.map((day, itemIndex) => itemIndex === index ? { ...day, ...patch } : day) })); }

  function addDay() {
    if (draft.days.length >= 7) return;
    const used = new Set(draft.days.map((day) => day.weekday));
    const weekday = weekDays.find((day) => !used.has(day)) ?? null;
    patchDraft({ days: [...draft.days, { dayName: `Workout day ${draft.days.length + 1}`, weekday, notes: "", exercises: [] }] });
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

  function toggleWorkout(workout: Workout) {
    const key = identity(workout);
    const exists = activeDay.exercises.some((item) => identity(item) === key);
    patchDay(activeDayIndex, { exercises: exists ? activeDay.exercises.filter((item) => identity(item) !== key) : [...activeDay.exercises, workout] });
  }

  async function savePlan() {
    if (!user?.id || !basicsValid || !exerciseStepValid || saving) return;
    setSaving(true);
    try {
      await createUserWorkoutPlan({
        userId: user.id,
        planName: draft.planName,
        goal: draft.goal || null,
        programDurationWeeks: draft.durationWeeks,
        sessionDurationMinutes: draft.sessionMinutes,
        days: draft.days
      });
      clearStoredValue(draftKey);
      toast({ title: "Workout plan created", description: `${draft.planName} is now your active plan.` });
      await onSaved?.();
    } catch (error) {
      toast({ title: "Plan could not be created", description: userSafeError(error, "Nothing was saved. Your draft is still on this device."), variant: "error" });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 pb-20">
      <ol className="grid grid-cols-3 gap-2" aria-label="Plan builder progress">
        {["Plan details", "Training days", "Review"].map((label, index) => { const number = index + 1; const active = step === number; const complete = step > number; return <li key={label} className={`rounded-2xl border p-3 ${active ? "border-primary bg-primary/10" : complete ? "border-success/40 bg-success/10" : "bg-card"}`}><span className="flex items-center gap-2 text-sm font-semibold">{complete ? <Check className="h-4 w-4" /> : <span className="grid h-5 w-5 place-items-center rounded-full border text-xs">{number}</span>} {label}</span></li>; })}
      </ol>

      {step === 1 ? <div className="space-y-5">
        <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label htmlFor="builder-name">Plan name</Label><Input id="builder-name" value={draft.planName} onChange={(event) => patchDraft({ planName: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="builder-goal">Goal</Label><Input id="builder-goal" value={draft.goal} onChange={(event) => patchDraft({ goal: event.target.value })} placeholder="Strength, endurance, mobility…" /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="builder-weeks">Weeks</Label><Input id="builder-weeks" type="number" min={1} max={104} value={draft.durationWeeks ?? ""} onChange={(event) => patchDraft({ durationWeeks: event.target.value ? Number(event.target.value) : null })} /></div><div className="space-y-2"><Label htmlFor="builder-minutes">Minutes</Label><Input id="builder-minutes" type="number" min={5} max={300} value={draft.sessionMinutes ?? ""} onChange={(event) => patchDraft({ sessionMinutes: event.target.value ? Number(event.target.value) : null })} /></div></div>
        </CardContent></Card>
        <section className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Weekly schedule</h2><p className="text-sm text-muted-foreground">Choose one unique weekday for each training day.</p></div><Button variant="outline" onClick={addDay} disabled={draft.days.length >= 7}><Plus className="h-4 w-4" /> Add day</Button></div>
          <div className="grid gap-3 md:grid-cols-2">{draft.days.map((day, index) => <Card key={index}><CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end"><div className="space-y-2"><Label htmlFor={`builder-day-${index}`}>Day {index + 1}</Label><Input id={`builder-day-${index}`} value={day.dayName} onChange={(event) => patchDay(index, { dayName: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`builder-weekday-${index}`}>Weekday</Label><Select id={`builder-weekday-${index}`} value={day.weekday ?? ""} onChange={(value) => patchDay(index, { weekday: value as Weekday })} options={weekDays} /></div><div className="flex"><Button variant="ghost" size="icon" aria-label={`Move ${day.dayName} up`} onClick={() => moveDay(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Move ${day.dayName} down`} onClick={() => moveDay(index, 1)} disabled={index === draft.days.length - 1}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={`Remove ${day.dayName}`} onClick={() => removeDay(index)} disabled={draft.days.length <= 1}><Trash2 className="h-4 w-4" /></Button></div><div className="space-y-2 sm:col-span-3"><Label htmlFor={`builder-notes-${index}`}>Day notes</Label><Input id={`builder-notes-${index}`} value={day.notes} onChange={(event) => patchDay(index, { notes: event.target.value })} placeholder="Optional focus or coaching note" /></div></CardContent></Card>)}</div>
        </section>
        {!basicsValid ? <p className="text-sm text-destructive">Add a plan name and give every day a unique weekday.</p> : null}
      </div> : null}

      {step === 2 ? <div className="space-y-5">
        <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Builder workout days">{draft.days.map((day, index) => <button key={`${day.weekday}-${index}`} type="button" role="tab" aria-selected={index === activeDayIndex} onClick={() => setActiveDayIndex(index)} className={`min-h-16 min-w-44 rounded-2xl border px-4 text-start ${index === activeDayIndex ? "border-primary bg-primary/10" : "bg-card"}`}><span className="block font-semibold">{day.dayName}</span><span className="text-xs text-muted-foreground">{day.exercises.length} selected</span></button>)}</div>
        <Card><CardContent className="p-4"><div className="relative"><Search className="absolute start-3 top-3 h-5 w-5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 ps-10" placeholder="Search the exercise library" /></div></CardContent></Card>
        {loadingResults ? <CardGridSkeleton count={3} rows={3} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{results.map((workout) => { const selected = activeDay.exercises.some((item) => identity(item) === identity(workout)); return <Card key={identity(workout)}><CardContent className="flex h-full flex-col p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{workout.name}</h3><p className="text-sm text-muted-foreground">{workout.target_muscle} · {workout.equipment}</p></div><Badge variant="outline">{workout.difficulty}</Badge></div><p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{workout.instructions}</p><Button className={`mt-4 ${selected ? "bg-success text-success-foreground hover:bg-success" : ""}`} variant={selected ? "default" : "outline"} aria-pressed={selected} onClick={() => toggleWorkout(workout)}>{selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{selected ? "Selected" : "Select"}</Button></CardContent></Card>; })}</div>}
        {!loadingResults && resultsError ? <div className="grid min-h-40 place-items-center rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-center"><div><Dumbbell className="mx-auto mb-2 h-6 w-6 text-destructive" /><p className="font-medium">Exercise library unavailable</p><p className="text-sm text-muted-foreground">{resultsError}</p></div></div> : null}
        {!loadingResults && !resultsError && !results.length ? <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed text-center"><div><Dumbbell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">No exercises found</p><p className="text-sm text-muted-foreground">Try a broader search.</p></div></div> : null}
        {!exerciseStepValid ? <p className="text-sm text-destructive">Select at least one exercise for every training day.</p> : null}
      </div> : null}

      {step === 3 ? <div className="space-y-4">
        <Card className="border-primary/30 bg-primary/5"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Ready to create</p><h2 className="mt-1 text-2xl font-semibold">{draft.planName}</h2><div className="mt-3 flex flex-wrap gap-2"><Badge>{draft.days.length} days</Badge><Badge variant="outline">{totalExercises} exercises</Badge>{draft.durationWeeks ? <Badge variant="outline">{draft.durationWeeks} weeks</Badge> : null}{draft.goal ? <Badge variant="outline">{draft.goal}</Badge> : null}</div></CardContent></Card>
        <div className="grid gap-3 md:grid-cols-2">{draft.days.map((day) => <Card key={`${day.weekday}-${day.dayName}`}><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{day.weekday}</p><h3 className="font-semibold">{day.dayName}</h3></div><Badge variant="outline">{day.exercises.length}</Badge></div><ol className="mt-3 space-y-2">{day.exercises.map((exercise, index) => <li key={`${identity(exercise)}-${index}`} className="flex justify-between gap-3 text-sm"><span>{index + 1}. {exercise.name}</span><span className="text-muted-foreground">{exercise.sets ?? 3} × {exercise.reps ?? "8–12"}</span></li>)}</ol></CardContent></Card>)}</div>
        <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Creating the plan saves every day and exercise together, then makes this the active plan. It does not start, complete, or skip a workout.</div>
      </div> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button variant="outline" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}><ArrowLeft className="h-4 w-4" /> Back</Button>
        {step < 3 ? <Button onClick={() => setStep((current) => Math.min(3, current + 1))} disabled={step === 1 ? !basicsValid : !exerciseStepValid}>Continue <ArrowRight className="h-4 w-4" /></Button> : <Button onClick={() => void savePlan()} disabled={saving || !basicsValid || !exerciseStepValid}>{saving ? "Creating…" : "Create plan"}</Button>}
      </div>
    </div>
  );
}
