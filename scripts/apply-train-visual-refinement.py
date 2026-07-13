from __future__ import annotations

from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing replacement target: {label}")
    return text.replace(old, new, 1)


def replace_section(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    try:
        start = text.index(start_marker)
        end = text.index(end_marker, start)
    except ValueError as error:
        raise RuntimeError(f"Missing section marker: {label}") from error
    return text[:start] + replacement.rstrip() + "\n\n" + text[end:]


# Shared note filtering: presentation hides legacy source metadata while edits preserve it.
write(
    "lib/workouts/train-visual.ts",
    r'''
const internalSourcePatterns = [
  /^\s*source\s*:\s*plaivra_legacy_workouts\s*$/i,
  /^\s*source\s*=\s*plaivra_legacy_workouts\s*$/i,
  /^\s*\[\s*source\s*:\s*plaivra_legacy_workouts\s*\]\s*$/i,
  /^\s*internal\s+source\s*:\s*plaivra_legacy_workouts\s*$/i
];

export function isInternalExerciseNoteLine(line: string) {
  return internalSourcePatterns.some((pattern) => pattern.test(line));
}

function noteLines(note: string | null | undefined) {
  return String(note ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function userFacingExerciseNote(note: string | null | undefined) {
  return noteLines(note).filter((line) => !isInternalExerciseNoteLine(line)).join("\n");
}

export function mergeUserFacingExerciseNote(original: string | null | undefined, nextUserText: string) {
  const hiddenLines = noteLines(original).filter(isInternalExerciseNoteLine);
  const visibleLines = noteLines(nextUserText).filter((line) => !isInternalExerciseNoteLine(line));
  return [...hiddenLines, ...visibleLines].join("\n") || null;
}
''',
)

# Action menus retain a descriptive accessible name while rendering a concise visible label.
action_menu = read("components/ui/action-menu.tsx")
action_menu = replace_once(
    action_menu,
    "export function ActionMenu({\n  label,\n  children,",
    "export function ActionMenu({\n  label,\n  visibleLabel,\n  children,",
    "ActionMenu visible label destructuring",
)
action_menu = replace_once(
    action_menu,
    "  label: string;\n  children: ReactNode;",
    "  label: string;\n  visibleLabel?: string;\n  children: ReactNode;",
    "ActionMenu visible label type",
)
action_menu = replace_once(
    action_menu,
    "        <span>{label}</span>",
    "        <span>{visibleLabel ?? label.split(\":\")[0]}</span>",
    "ActionMenu concise visible label",
)
write("components/ui/action-menu.tsx", action_menu)

# Responsive drawers are true full-screen mobile sheets and wide desktop drawers.
dialog = read("components/ui/dialog.tsx")
dialog = re.sub(
    r'layout === "responsive-drawer"\n\s*\? "[^"]+"',
    'layout === "responsive-drawer"\n      ? "fixed inset-0 z-[110] flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden overscroll-contain rounded-none border-0 p-0 shadow-luxe outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(54rem,100vw)] lg:max-w-[54rem] lg:border-y-0 lg:border-l lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r"',
    dialog,
    count=1,
)
dialog = replace_once(
    dialog,
    'className="absolute right-3 top-3 z-20 min-h-11 min-w-11 rtl:left-3 rtl:right-auto"',
    'className="absolute right-[calc(env(safe-area-inset-right)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 min-h-11 min-w-11 lg:right-3 lg:top-3 rtl:left-[calc(env(safe-area-inset-left)+0.75rem)] rtl:right-auto lg:rtl:left-3"',
    "safe area close button",
)
write("components/ui/dialog.tsx", dialog)

# Exercise picker: wide two-column desktop drawer, full-screen mobile, wrapped filters, fixed footer.
write(
    "components/workouts/exercise-picker-dialog.tsx",
    r'''
"use client";

import { Check, Dumbbell, ExternalLink, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-field";
import { CardGridSkeleton } from "@/components/ui/state-views";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getWorkoutFilterOptions, getWorkouts, type WorkoutFilterOptions } from "@/services/database/workout-library";
import type { Workout } from "@/types";

function exerciseKey(exercise: Pick<Workout, "id" | "name" | "target_muscle">) {
  return `${exercise.id}-${exercise.name}-${exercise.target_muscle}`;
}

function stringOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

export function ExercisePickerDialog({ open, onOpenChange, dayName, existingKeys, onAdd }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayName: string;
  existingKeys: string[];
  onAdd: (exercises: Workout[]) => void;
}) {
  const { dir, tr } = useTrainTranslation();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [muscleCategory, setMuscleCategory] = useState("");
  const [secondaryMuscle, setSecondaryMuscle] = useState("");
  const [forceType, setForceType] = useState("");
  const [exerciseType, setExerciseType] = useState("");
  const [mechanics, setMechanics] = useState("");
  const [results, setResults] = useState<Workout[]>([]);
  const [filterOptions, setFilterOptions] = useState<WorkoutFilterOptions | null>(null);
  const [selected, setSelected] = useState<Map<string, Workout>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    void getWorkoutFilterOptions().then((options) => {
      if (current) setFilterOptions(options);
    }).catch(() => {
      // Result-derived options remain available if filter metadata fails.
    });
    return () => { current = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      getWorkouts(query.trim(), {
        primaryMuscles: muscle ? [muscle] : [],
        equipmentRequired: equipment ? [equipment] : [],
        difficulty: difficulty || undefined,
        muscleCategories: muscleCategory ? [muscleCategory] : [],
        secondaryMuscles: secondaryMuscle ? [secondaryMuscle] : [],
        forceTypes: forceType ? [forceType] : [],
        exerciseTypes: exerciseType ? [exerciseType] : [],
        mechanics: mechanics ? [mechanics] : []
      }, 0)
        .then((items) => { if (current) setResults(items.slice(0, 60)); })
        .catch((loadError) => { if (current) { setResults([]); setError(userSafeError(loadError, tr("libraryLoadFailed"))); } })
        .finally(() => { if (current) setLoading(false); });
    }, 180);
    return () => { current = false; window.clearTimeout(timer); };
  }, [difficulty, equipment, exerciseType, forceType, mechanics, muscle, muscleCategory, open, query, secondaryMuscle, tr]);

  useEffect(() => {
    if (!open) setSelected(new Map());
  }, [open]);

  const muscleOptions = useMemo(() => filterOptions?.primaryMuscles ?? stringOptions(results.map((item) => item.target_muscle)), [filterOptions, results]);
  const equipmentOptions = useMemo(() => filterOptions?.equipmentRequired ?? stringOptions(results.map((item) => item.equipment)), [filterOptions, results]);
  const difficultyOptions = useMemo(() => filterOptions?.experienceLevels ?? stringOptions(results.map((item) => item.difficulty)), [filterOptions, results]);
  const muscleCategoryOptions = useMemo(() => filterOptions?.muscleCategories ?? stringOptions(results.map((item) => item.muscle_category)), [filterOptions, results]);
  const secondaryMuscleOptions = useMemo(() => filterOptions?.secondaryMuscles ?? Array.from(new Set(results.flatMap((item) => item.secondary_muscles ?? []))).sort(), [filterOptions, results]);
  const forceTypeOptions = useMemo(() => filterOptions?.forceTypes ?? stringOptions(results.map((item) => item.force_type)), [filterOptions, results]);
  const exerciseTypeOptions = useMemo(() => filterOptions?.exerciseTypes ?? stringOptions(results.map((item) => item.category)), [filterOptions, results]);
  const mechanicsOptions = useMemo(() => filterOptions?.mechanics ?? stringOptions(results.map((item) => item.mechanics)), [filterOptions, results]);

  function toggle(exercise: Workout) {
    const key = exerciseKey(exercise);
    if (existing.has(key)) return;
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, exercise);
      return next;
    });
  }

  function addSelected() {
    onAdd(Array.from(selected.values()));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layout="responsive-drawer"
        className="w-screen max-w-none lg:w-[min(54rem,100vw)] lg:max-w-[54rem]"
        closeLabel={tr("closePicker")}
        dir={dir}
        data-train-exercise-picker
      >
        <DialogHeader className="mb-0 shrink-0 border-b px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] pe-16 text-start lg:pt-4">
          <DialogTitle className="text-xl">{tr("addExercisesTo", { day: dayName })}</DialogTitle>
          <DialogDescription className="font-medium text-foreground/70">{tr("selectedCount", { count: selected.size })}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-32 sm:px-5" data-picker-scroll-region>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-picker-filters>
            <label className="relative sm:col-span-2 lg:col-span-1">
              <span className="sr-only">{tr("searchExercises")}</span>
              <Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 ps-10" placeholder={tr("searchExercises")} />
            </label>
            <Select aria-label={tr("primaryMuscle")} value={muscle} onChange={setMuscle} placeholder={tr("primaryMuscle")} options={muscleOptions} />
            <Select aria-label={tr("equipment")} value={equipment} onChange={setEquipment} placeholder={tr("equipment")} options={equipmentOptions} />
            <Select aria-label={tr("difficulty")} value={difficulty} onChange={setDifficulty} placeholder={tr("difficulty")} options={difficultyOptions} />
          </div>

          <details className="mt-3 rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
            <summary className="min-h-11 cursor-pointer select-none content-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tr("moreFilters")}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Select aria-label={tr("muscleCategory")} value={muscleCategory} onChange={setMuscleCategory} placeholder={tr("muscleCategory")} options={muscleCategoryOptions} />
              <Select aria-label={tr("secondaryMuscle")} value={secondaryMuscle} onChange={setSecondaryMuscle} placeholder={tr("secondaryMuscle")} options={secondaryMuscleOptions} />
              <Select aria-label={tr("forceType")} value={forceType} onChange={setForceType} placeholder={tr("forceType")} options={forceTypeOptions} />
              <Select aria-label={tr("exerciseType")} value={exerciseType} onChange={setExerciseType} placeholder={tr("exerciseType")} options={exerciseTypeOptions} />
              <Select aria-label={tr("mechanics")} value={mechanics} onChange={setMechanics} placeholder={tr("mechanics")} options={mechanicsOptions} />
            </div>
          </details>

          {loading ? <div className="mt-4"><CardGridSkeleton count={4} rows={3} /></div> : null}
          {error ? <div role="alert" className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</div> : null}

          {!loading && !error ? (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2" data-picker-results>
              {results.map((exercise) => {
                const key = exerciseKey(exercise);
                const duplicate = existing.has(key);
                const isSelected = selected.has(key);
                const guideUrl = exercise.custom_video_url || exercise.video_url || exercise.exercise_url;
                return (
                  <article key={key} className={`flex min-h-56 flex-col rounded-2xl border p-4 ${duplicate ? "border-border/60 bg-muted/30" : isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card"}`}>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold leading-6">{exercise.name}</h3>
                        <p className="mt-1 break-words text-sm text-muted-foreground">{exercise.target_muscle} · {exercise.equipment}</p>
                      </div>
                      {exercise.difficulty ? <Badge variant="outline" className="shrink-0">{exercise.difficulty}</Badge> : null}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">{exercise.instructions}</p>
                    <div className={`mt-auto grid gap-2 pt-4 ${guideUrl ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                      <Button type="button" variant={isSelected ? "default" : "outline"} className="min-h-11 w-full" disabled={duplicate} aria-pressed={isSelected} onClick={() => toggle(exercise)}>
                        {duplicate || isSelected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {duplicate ? tr("alreadyAdded") : isSelected ? tr("deselect") : tr("select")}
                      </Button>
                      {guideUrl ? <Button asChild type="button" variant="ghost" className="min-h-11"><a href={guideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{tr("viewGuide")}</a></Button> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {!loading && !error && !results.length ? <div className="mt-4 grid min-h-40 place-items-center rounded-2xl border border-dashed text-center"><div><Dumbbell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">{tr("noExercisesFound")}</p><p className="text-sm text-muted-foreground">{tr("broaderSearch")}</p></div></div> : null}
        </div>

        <div className="shrink-0 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:px-5" data-picker-footer>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-h-11 items-center gap-2">
              <span className="text-sm font-semibold">{tr("selectedCount", { count: selected.size })}</span>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSelected(new Map())} disabled={!selected.size}>{tr("clear")}</Button>
            </div>
            <Button type="button" className="min-h-12 min-w-44" onClick={addSelected} disabled={!selected.size}>{tr("addNExercises", { count: selected.size })}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { exerciseKey };
''',
)

# Overview component function-level visual refinement while preserving data/runtime logic.
overview = read("components/workouts/my-workout-plans.tsx")
overview = replace_once(
    overview,
    '''action={visiblePlansState === "loaded" && !availablePlans.length ? undefined : (
          <>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => openTrainPrompts()}>
              <Bot className="h-4 w-4" /> {tr("askChatGpt")}
            </Button>
            <ActionMenu label={tr("createPlan")} icon={<Plus className="h-4 w-4" />} triggerVariant="default" triggerClassName="min-h-12">
              <ActionMenuItem onSelect={() => openTrainPrompts("create-workout-plan")}>{tr("createWithChatGpt")}</ActionMenuItem>
              <ActionMenuItem onSelect={() => router.push("/my-workout/plans/builder")}>{tr("createManually")}</ActionMenuItem>
            </ActionMenu>
          </>
        )}''',
    '''action={visiblePlansState === "loaded" && !availablePlans.length ? undefined : (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button type="button" variant="outline" className="min-h-12 w-full sm:w-auto" onClick={() => openTrainPrompts()}>
              <Bot className="h-4 w-4" /> {tr("askChatGpt")}
            </Button>
            <ActionMenu label={tr("createPlan")} visibleLabel={tr("createPlan")} icon={<Plus className="h-4 w-4" />} triggerVariant="default" triggerClassName="min-h-12 w-full sm:w-auto">
              <ActionMenuItem onSelect={() => openTrainPrompts("create-workout-plan")}>{tr("createWithChatGpt")}</ActionMenuItem>
              <ActionMenuItem onSelect={() => router.push("/my-workout/plans/builder")}>{tr("createManually")}</ActionMenuItem>
            </ActionMenu>
          </div>
        )}''',
    "overview header actions",
)
overview = overview.replace('className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"', 'className="grid gap-3 lg:grid-cols-2"', 1)

today_card = r'''
function TodayCard({
  plan,
  day,
  nextDay,
  openSession,
  today,
  resolution,
  actionHref,
  statusState,
  statusError,
  onRetryStatus
}: {
  plan: UserWorkoutPlan | null;
  day: CalendarDay | null;
  nextDay: CalendarDay | null;
  openSession: WorkoutSession | null;
  today: string;
  resolution: ReturnType<typeof resolveTodayWorkout>;
  actionHref: string | null;
  statusState: LoadState;
  statusError: string | null;
  onRetryStatus: () => Promise<void>;
}) {
  const { locale, tr } = useTrainTranslation();
  const preview = day?.exercises.slice(0, 3) ?? [];
  const remaining = Math.max(0, (day?.exercises.length ?? 0) - preview.length);
  const duration = plan ? (plan as PlanMeta).session_duration_minutes : null;
  const active = resolution.state === "active";
  const actionLabel = active ? tr("resumeWorkout") : resolution.state === "completed" ? tr("viewCompletedWorkout") : resolution.state === "skipped" ? tr("skippedToday") : tr("startWorkout");
  const title = active
    ? day?.dayName || openSession?.workout_day_name || openSession?.workout_name || tr("todaysWorkout")
    : day?.dayName ?? tr("todayRestDay");
  const subtitle = active
    ? plan?.name || tr("inProgress")
    : day
      ? plan?.name || ""
      : nextDay
        ? tr("nextWorkout", { workout: nextDay.dayName, weekday: localizedWeekday(nextDay.weekday, locale) })
        : plan?.name || "";
  const showActiveAction = active && Boolean(actionHref);
  const showWorkoutAction = showActiveAction || (statusState !== "loading" && !statusError && Boolean(actionHref));

  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/[0.045]" data-train-today-card>
      <CardContent className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(190px,240px)] lg:items-stretch">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{tr("today")}</p>
              <span className="text-xs font-medium text-muted-foreground">{new Date(`${today}T12:00:00`).toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}</span>
              {active ? <Badge>{tr("inProgress")}</Badge> : resolution.state === "completed" ? <Badge variant="secondary">{tr("completed")}</Badge> : resolution.state === "skipped" ? <Badge variant="outline">{tr("skippedToday")}</Badge> : null}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p> : null}
            {day ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Dumbbell className="h-4 w-4" /> {tr("exercises", { count: day.exercises.length })}</span>
                {duration ? <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {tr("aboutMinutes", { count: duration })}</span> : null}
              </div>
            ) : null}

            {day && preview.length ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={tr("selectedExercises")}>
                {preview.map((exercise, index) => (
                  <li key={exercise.plan_exercise_id ?? exercise.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{exercise.name}</span><span className="block text-xs text-muted-foreground">{exercise.sets ?? 3} × {exercise.reps ?? "8–12"}{exercise.target_muscle ? ` · ${exercise.target_muscle}` : ""}</span></span>
                  </li>
                ))}
                {remaining ? <li className="flex min-h-12 items-center rounded-xl border border-dashed border-border/70 px-3 text-sm font-medium text-muted-foreground">{tr("moreExercises", { count: remaining })}</li> : null}
              </ul>
            ) : null}
          </div>

          <div className="flex min-h-28 flex-col justify-center rounded-2xl border border-border/70 bg-background/80 p-3.5">
            {statusState === "loading" && !showActiveAction ? <Button disabled className="min-h-12 w-full">{tr("checkingStatus")}</Button> : null}
            {statusState !== "loading" && statusError && !showActiveAction ? (
              <><p className="mb-3 text-sm leading-5 text-muted-foreground">{statusError}</p><Button variant="outline" className="min-h-12 w-full" onClick={() => void onRetryStatus()}><RefreshCcw className="h-4 w-4" /> {tr("retryStatus")}</Button></>
            ) : null}
            {showWorkoutAction ? (
              <Button asChild className="min-h-12 w-full"><Link href={actionHref!}>{resolution.state === "completed" ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}{actionLabel}</Link></Button>
            ) : null}
            {statusState !== "loading" && !statusError && !actionHref ? <div className="text-center"><Dumbbell className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">{tr("restDay")}</p></div> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
'''
overview = replace_section(overview, "function TodayCard(", "\nfunction ThisWeek(", today_card, "TodayCard")

this_week = r'''
function ThisWeek({
  days,
  sessions,
  weekStartsOn,
  today,
  todayPlanDayId,
  todayResolution
}: {
  days: CalendarDay[];
  sessions: WorkoutSession[];
  weekStartsOn: "monday" | "sunday";
  today: string;
  todayPlanDayId: string | null;
  todayResolution: ReturnType<typeof resolveTodayWorkout>;
}) {
  const { locale, tr } = useTrainTranslation();
  const week = useMemo(() => buildCurrentWeek(weekStartsOn, new Date(`${today}T12:00:00`)), [today, weekStartsOn]);
  const [selectedIso, setSelectedIso] = useState(today);
  const weekIsos = useMemo(() => week.map((day) => day.iso), [week]);
  useEffect(() => {
    setSelectedIso((current) => resolveTrainWeekSelection(current, today, weekIsos));
  }, [today, weekIsos]);
  const selectedWeekDay = week.find((day) => day.iso === selectedIso) ?? week[0];
  const selectedDay = days.find((day) => day.weekday === selectedWeekDay?.weekday) ?? null;

  return (
    <section aria-labelledby="this-week-heading" className="space-y-3" data-train-week>
      <SectionHeading id="this-week-heading" title={tr("thisWeek")} description={tr("thisWeekDescription")} />
      <div className="grid snap-x grid-flow-col auto-cols-[minmax(104px,1fr)] gap-2 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible" role="tablist" aria-label={tr("thisWeek")}>
        {week.map(({ date, iso, weekday }) => {
          const planDay = days.find((day) => day.weekday === weekday) ?? null;
          const session = planDay ? sessions.find((item) => item.plan_day_id === planDay.id && workoutSessionLocalDate(item) === iso) : null;
          const isToday = iso === today;
          const isSelected = selectedIso === iso;
          const status = isToday && planDay && planDay.id === todayPlanDayId
            ? todayResolution.state
            : session?.status === "completed"
              ? "completed"
              : session?.status === "skipped"
                ? "skipped"
                : planDay
                  ? "scheduled"
                  : "rest";
          const stateLabel = status === "active" ? tr("inProgress") : status === "completed" ? tr("completed") : status === "scheduled" ? tr("scheduled") : status === "skipped" ? tr("skippedToday") : tr("rest");
          return (
            <button
              type="button"
              role="tab"
              key={iso}
              onClick={() => setSelectedIso(iso)}
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              data-week-state={status}
              data-week-selected={isSelected || undefined}
              className={`min-h-24 snap-start rounded-2xl border p-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? "border-primary bg-primary/10 ring-1 ring-primary/25" : isToday ? "border-primary/50 bg-primary/[0.04]" : "border-border/70 bg-card"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div><p className="text-xs font-semibold uppercase text-muted-foreground">{date.toLocaleDateString(locale, { weekday: "short" })}</p><p className="mt-0.5 text-base font-semibold">{date.getDate()}</p></div>
                <div className="flex flex-col items-end gap-1">{isToday ? <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{tr("todayLabel")}</Badge> : null}{isSelected && !isToday ? <span className="text-[10px] font-semibold text-primary">{tr("selectedDay")}</span> : null}</div>
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-semibold">{planDay?.dayName ?? tr("rest")}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">{status === "completed" ? <Check className="h-3.5 w-3.5 text-success" /> : <span className={`h-2 w-2 rounded-full ${status === "active" ? "bg-primary" : status === "skipped" ? "bg-warning" : status === "scheduled" ? "bg-foreground/50" : "bg-muted-foreground/40"}`} />}{stateLabel}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-2xl border border-border/70 bg-card p-4" data-selected-day-preview>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{selectedWeekDay?.date.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}</p>
            <p className="mt-1 font-semibold">{selectedDay?.dayName ?? tr("restDay")}</p>
            {selectedDay ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{tr("exercises", { count: selectedDay.exercises.length })}{selectedDay.exercises.length ? ` · ${selectedDay.exercises.slice(0, 3).map((exercise) => exercise.name).join(" · ")}` : ""}{selectedDay.exercises.length > 3 ? ` · ${tr("moreExercises", { count: selectedDay.exercises.length - 3 })}` : ""}</p> : <p className="mt-1 text-sm text-muted-foreground">{tr("restDay")}</p>}
          </div>
          {selectedDay ? <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto"><Link href={`/my-workout/plans/${selectedDay.planId}?day=${encodeURIComponent(selectedDay.id)}`}>{tr("viewDay")}</Link></Button> : null}
        </div>
      </div>
    </section>
  );
}
'''
overview = replace_section(overview, "function ThisWeek(", "\nfunction ActivePlanRow", this_week, "ThisWeek")

active_row = r'''
function ActivePlanRow({ plan, busy, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  const { tr } = useTrainTranslation();
  const durationWeeks = planDurationWeeks(plan);
  return (
    <Card data-active-plan-row>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 truncate text-lg font-semibold">{plan.name}</h3><Badge>{tr("active")}</Badge><Badge variant="outline">{sourceLabel(plan, tr("sourceManual"))}</Badge></div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{tr("trainingDays", { count: plan.days.length })} · {tr("exercises", { count: planExerciseCount(plan) })}{durationWeeks ? ` · ${tr("programWeeks", { count: durationWeeks })}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
          <Button asChild variant="outline" className="min-h-11"><Link href={`/my-workout/plans/${plan.id}`}>{tr("viewPlan")}</Link></Button>
          <Button asChild variant="ghost" className="min-h-11"><Link href={`/my-workout/plans/${plan.id}/edit`}>{tr("editPlan")}</Link></Button>
          <PlanMenu plan={plan} busy={busy} active onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
}
'''
overview = replace_section(overview, "function ActivePlanRow", "\nfunction CompactPlanRow", active_row, "ActivePlanRow")

compact_row = r'''
function CompactPlanRow({ plan, busy, onActivate, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; onActivate: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  const { tr } = useTrainTranslation();
  const durationWeeks = planDurationWeeks(plan);
  return (
    <Card data-compact-plan-row>
      <CardContent className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted"><CalendarDays className="h-5 w-5" /></div>
        <Link href={`/my-workout/plans/${plan.id}`} className="min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="min-w-0 truncate text-sm font-semibold">{plan.name}</p><Badge variant="outline" className="shrink-0">{sourceLabel(plan, tr("sourceManual"))}</Badge></div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{tr("trainingDays", { count: plan.days.length })} · {tr("exercises", { count: planExerciseCount(plan) })}{durationWeeks ? ` · ${tr("programWeeks", { count: durationWeeks })}` : ""}</p>
        </Link>
        <PlanMenu plan={plan} busy={busy} active={false} onActivate={onActivate} onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} />
      </CardContent>
    </Card>
  );
}
'''
overview = replace_section(overview, "function CompactPlanRow", "\nfunction PlanMenu", compact_row, "CompactPlanRow")
overview = replace_once(
    overview,
    '<ActionMenu label={`${tr("moreActions")}: ${plan.name}`} disabled={busy} triggerClassName="min-h-11 px-3" icon={<MoreHorizontal className="h-4 w-4" />}>',
    '<ActionMenu label={`${tr("moreActions")}: ${plan.name}`} visibleLabel={tr("moreActions")} disabled={busy} triggerVariant="ghost" triggerClassName="min-h-11 shrink-0 px-3" icon={<MoreHorizontal className="h-4 w-4" />}>',
    "Plan menu visible label",
)
overview = replace_once(
    overview,
    'className="group rounded-[18px] border border-border/70 bg-card p-4 transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"',
    'className="group rounded-[18px] border border-border/70 bg-card p-3.5 transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"',
    "destination card density",
)
overview = replace_once(overview, 'className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"', 'className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"', "destination icon density")
write("components/workouts/my-workout-plans.tsx", overview)

# Builder visual system: focused Step 1, compact stepper, explicit day validation, responsive prescription rows.
builder = read("components/workouts/workout-plan-builder.tsx")
builder = replace_once(
    builder,
    'import { todayIso } from "@/lib/date-utils";',
    'import { todayIso } from "@/lib/date-utils";\nimport { mergeUserFacingExerciseNote, userFacingExerciseNote } from "@/lib/workouts/train-visual";',
    "builder note helper import",
)
builder_marker = '  return (\n    <div className="space-y-6 pb-20"'
if builder_marker not in builder:
    raise RuntimeError("Builder return marker missing")
builder_prefix = builder[: builder.index(builder_marker)]
builder_return = r'''
  return (
    <div className="space-y-6 pb-28" dir={dir} data-train-builder>
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

      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:static sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:items-center sm:justify-between sm:rounded-2xl sm:border sm:px-4 sm:pb-3">
        <Button variant="outline" className="min-h-11" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("back")}</Button>
        {step < 3 ? <Button className="min-h-11" onClick={() => setStep((current) => Math.min(3, current + 1))} disabled={step === 1 ? !planDetailsValid : !scheduleValid || !exerciseStepValid}>{tr("continue")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button> : <Button className="min-h-11" onClick={() => void savePlan()} disabled={saving || !basicsValid || !exerciseStepValid}>{saving ? tr("savingPlan") : tr("savePlan")}</Button>}
      </div>
      <ExercisePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} dayName={activeDay.dayName} existingKeys={activeDay.exercises.map(exerciseKey)} onAdd={addExercises} />
      {unsavedDialog}
    </div>
  );
}
'''
write("components/workouts/workout-plan-builder.tsx", builder_prefix + builder_return)

# Editor uses the same day-navigation and prescription-row system.
editor = read("components/workouts/workout-plan-editor.tsx")
editor = replace_once(
    editor,
    'import { clearStoredValue, readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";',
    'import { clearStoredValue, readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";\nimport { mergeUserFacingExerciseNote, userFacingExerciseNote } from "@/lib/workouts/train-visual";',
    "editor note helper import",
)
editor_marker = '  return (\n    <div className="space-y-6 pb-24"'
if editor_marker not in editor:
    raise RuntimeError("Editor return marker missing")
editor_prefix = editor[: editor.index(editor_marker)]
editor_return = r'''
  return (
    <div className="space-y-6 pb-32" dir={dir} data-train-editor>
      <PageHeading title={`${tr("editPlanTitle")} · ${draft.name}`} description={tr("editorDescription")} action={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Button asChild variant="ghost" className="min-h-11"><Link href={`/my-workout/plans/${draft.id}`}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("back")}</Link></Button><Button variant="outline" className="min-h-11" onClick={cancel}>{tr("cancel")}</Button></div>} />

      {saveState === "restored" ? <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">{tr("draftRestored")}</p><p className="text-muted-foreground">{tr("draftRestoredDescription")}</p></div></div> : null}

      <Card><CardContent className="grid gap-4 p-5 md:grid-cols-3">
        <div className="space-y-2 md:col-span-3"><Label htmlFor="plan-name">{tr("planName")}</Label><Input id="plan-name" value={draft.name} onChange={(event) => patchPlan({ name: event.target.value })} /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="plan-goal">{tr("goal")}</Label><Input id="plan-goal" value={draft.goal ?? ""} onChange={(event) => patchPlan({ goal: event.target.value || null })} placeholder={tr("goalPlaceholder")} /></div>
        <div className="space-y-2"><Label htmlFor="plan-weeks">{tr("programDuration")}</Label><Input id="plan-weeks" type="number" min={1} max={104} value={draft.program_duration_weeks ?? ""} onChange={(event) => patchPlan({ program_duration_weeks: event.target.value ? Number(event.target.value) : null })} /><p className="text-xs text-muted-foreground">{tr("weeks")}</p></div>
        <div className="space-y-2 md:col-span-3"><Label htmlFor="plan-description">{tr("description")}</Label><textarea id="plan-description" className="min-h-20 w-full resize-y rounded-[14px] border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.description ?? ""} onChange={(event) => patchPlan({ description: event.target.value || null })} /></div>
      </CardContent></Card>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <section className="space-y-3 xl:sticky xl:top-6" aria-labelledby="editor-days-heading">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="editor-days-heading" className="text-xl font-semibold">{tr("trainingDaysHeading")}</h2><p className="text-sm text-muted-foreground">{tr("selectDayToEdit")}</p></div><Button variant="outline" className="min-h-11" onClick={addDay} disabled={draft.days.length >= 7}><Plus className="h-4 w-4" /> {tr("addDay")}</Button></div>
          <div className="grid grid-flow-col auto-cols-[minmax(190px,1fr)] gap-2 overflow-x-auto pb-2 xl:grid-flow-row xl:auto-cols-auto xl:overflow-visible" role="tablist" aria-label={tr("workoutDays")} data-editor-day-tabs>
            {draft.days.map((day, index) => {
              const selected = day.clientKey === selectedDay?.clientKey;
              const incomplete = !day.exercises.length;
              return <div key={day.clientKey} className={`flex min-w-0 items-center gap-1 rounded-2xl border p-1 ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/20" : incomplete ? "border-warning/50 bg-warning/5" : "border-border/70 bg-card"}`}><button type="button" role="tab" aria-selected={selected} className="min-h-14 min-w-0 flex-1 rounded-xl px-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedDayKey(day.clientKey)}><span className="block truncate font-semibold">{day.day_name}</span><span className={`mt-1 block text-xs font-medium ${incomplete ? "text-warning-foreground" : "text-muted-foreground"}`}>{incomplete ? tr("noExercisesAdded") : tr("exercises", { count: day.exercises.length })}</span></button><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveUp", { name: day.day_name })} title={tr("moveUp", { name: day.day_name })} onClick={() => moveDay(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveDown", { name: day.day_name })} title={tr("moveDown", { name: day.day_name })} onClick={() => moveDay(index, 1)} disabled={index === draft.days.length - 1}><ArrowDown className="h-4 w-4" /></Button></div>;
            })}
          </div>
        </section>

        {selectedDay && selectedDayIndex >= 0 ? <Card><CardContent className="space-y-6 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end" data-day-configuration>
            <div className="space-y-2"><Label htmlFor="day-name">{tr("dayName")}</Label><Input id="day-name" value={selectedDay.day_name} onChange={(event) => patchDay(selectedDayIndex, { day_name: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="day-weekday">{tr("weekday")}</Label><Select id="day-weekday" value={selectedDay.weekday ?? ""} onChange={(value) => patchDay(selectedDayIndex, { weekday: (value || null) as Weekday | null })} placeholder={tr("unscheduled")} options={weekdayOptions} /></div>
            <Button variant="ghost" className="min-h-11 text-destructive" onClick={() => removeDay(selectedDayIndex)} disabled={draft.days.length <= 1}><Trash2 className="h-4 w-4" /> {tr("removeDay")}</Button>
            <div className="space-y-2 lg:col-span-3"><Label htmlFor="day-notes">{tr("dayNotes")}</Label><Input id="day-notes" value={selectedDay.notes ?? ""} onChange={(event) => patchDay(selectedDayIndex, { notes: event.target.value || null })} placeholder={tr("dayNotesPlaceholder")} /></div>
            {!selectedDay.exercises.length ? <p className="text-sm font-medium text-destructive lg:col-span-3">{selectedDay.day_name}: {tr("addExercisesToContinue")}</p> : null}
          </div>

          <section className="space-y-3" aria-labelledby="editor-selected-exercises"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="editor-selected-exercises" className="text-lg font-semibold">{tr("selectedExercises")}</h3><p className="text-sm text-muted-foreground">{tr("chooseThenEdit")}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{selectedDay.exercises.length}</Badge><Button variant="outline" className="min-h-11" onClick={() => setPickerOpen(true)}><Plus className="h-4 w-4" /> {tr("addExercises")}</Button></div></div>
            <div className="space-y-3">
              {selectedDay.exercises.map((exercise, exerciseIndex) => (
                <article key={exercise.clientKey} className="rounded-2xl border border-border/70 bg-card p-4" data-exercise-prescription>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2 sm:col-span-2 lg:col-span-1"><Label htmlFor={`exercise-name-${exercise.clientKey}`}>{tr("exerciseNumber", { count: exerciseIndex + 1 })}</Label><Input id={`exercise-name-${exercise.clientKey}`} value={exercise.exercise_name} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { exercise_name: event.target.value })} placeholder={tr("exerciseName")} /></div>
                    <div className="space-y-2"><Label htmlFor={`muscle-${exercise.clientKey}`}>{tr("target")}</Label><Input id={`muscle-${exercise.clientKey}`} value={exercise.target_muscle ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { target_muscle: event.target.value || null })} placeholder={tr("targetPlaceholder")} /></div>
                    <div className="space-y-2"><Label htmlFor={`equipment-${exercise.clientKey}`}>{tr("equipment")}</Label><Input id={`equipment-${exercise.clientKey}`} value={exercise.equipment ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { equipment: event.target.value || null })} /></div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-[90px_120px_120px_minmax(180px,1fr)_auto] xl:items-end">
                    <div className="space-y-2"><Label htmlFor={`sets-${exercise.clientKey}`}>{tr("sets")}</Label><Input id={`sets-${exercise.clientKey}`} type="number" min={1} value={exercise.sets ?? 3} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { sets: Number(event.target.value) || 0 })} /></div>
                    <div className="space-y-2"><Label htmlFor={`reps-${exercise.clientKey}`}>{tr("reps")}</Label><Input id={`reps-${exercise.clientKey}`} value={exercise.reps ?? ""} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { reps: event.target.value || null })} /></div>
                    <div className="space-y-2"><Label htmlFor={`rest-${exercise.clientKey}`}>{tr("restSeconds")}</Label><Input id={`rest-${exercise.clientKey}`} type="number" min={0} value={exercise.rest_seconds ?? 75} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { rest_seconds: Number(event.target.value) || 0 })} /></div>
                    <div className="space-y-2 sm:col-span-3 xl:col-span-1"><Label htmlFor={`notes-${exercise.clientKey}`}>{tr("notes")}</Label><Input id={`notes-${exercise.clientKey}`} value={userFacingExerciseNote(exercise.notes)} onChange={(event) => patchExercise(selectedDayIndex, exerciseIndex, { notes: mergeUserFacingExerciseNote(exercise.notes, event.target.value) })} /></div>
                    <div className="flex gap-1 sm:col-span-3 xl:col-span-1 xl:justify-end"><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveUp", { name: exercise.exercise_name || tr("thisExercise") })} title={tr("moveUp", { name: exercise.exercise_name || tr("thisExercise") })} onClick={() => moveExercise(selectedDayIndex, exerciseIndex, -1)} disabled={exerciseIndex === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={tr("moveDown", { name: exercise.exercise_name || tr("thisExercise") })} title={tr("moveDown", { name: exercise.exercise_name || tr("thisExercise") })} onClick={() => moveExercise(selectedDayIndex, exerciseIndex, 1)} disabled={exerciseIndex === selectedDay.exercises.length - 1}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-destructive" aria-label={tr("removeItem", { name: exercise.exercise_name || tr("thisExercise") })} title={tr("removeItem", { name: exercise.exercise_name || tr("thisExercise") })} onClick={() => removeExercise(selectedDayIndex, exerciseIndex)}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                </article>
              ))}
            </div>
            {!selectedDay.exercises.length ? <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed text-center"><div><Dumbbell className="mx-auto mb-2 h-5 w-5 text-muted-foreground" /><p className="font-medium">{tr("noExercisesYet")}</p><Button type="button" variant="ghost" className="mt-2 min-h-11" onClick={() => setPickerOpen(true)}>{tr("addExercises")}</Button></div></div> : null}
          </section>
        </CardContent></Card> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:static sm:rounded-2xl sm:border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm"><p className="font-semibold">{saveState === "saving" ? tr("saving") : saveState === "saved" ? tr("saved") : isDirty ? tr("unsavedChanges") : tr("noUnsavedChanges")}</p>{validationError ? <p className="text-destructive">{validationError}</p> : saveError ? <p className="text-destructive">{saveError}</p> : <p className="text-muted-foreground">{tr("atomicSaveNotice")}</p>}</div>
          <div className="flex gap-2"><Button variant="outline" className="min-h-11" onClick={cancel}>{tr("cancel")}</Button><Button className="min-h-11" onClick={() => void save()} disabled={!isDirty || Boolean(validationError) || saveState === "saving"}>{saveState === "saved" ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saveState === "saving" ? tr("saving") : tr("saveChanges")}</Button></div>
        </div>
      </div>
      {selectedDay && selectedDayIndex >= 0 ? <ExercisePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} dayName={selectedDay.day_name} existingKeys={selectedDay.exercises.map((exercise) => `${exercise.source_workout_id || exercise.workout_id || exercise.id}-${exercise.exercise_name}-${exercise.target_muscle || ""}`)} onAdd={(workouts) => addLibraryExercises(selectedDayIndex, workouts)} /> : null}
      {dialog}
      {unsavedDialog}
    </div>
  );
}
'''
write("components/workouts/workout-plan-editor.tsx", editor_prefix + editor_return)

# Localization for explicit duration labels, selected state, and local day validation.
i18n = read("lib/i18n/train.ts")
i18n = replace_once(
    i18n,
    'builderProgress: "Plan builder progress", planName:',
    'builderProgress: "Plan builder progress", programDuration: "Program duration", sessionDuration: "Session duration", noExercisesAdded: "No exercises", addExercisesToContinue: "Add at least one exercise to continue", selectedDay: "Selected", planName:',
    "English visual copy",
)
i18n = replace_once(
    i18n,
    'builderProgress: "Fortschritt des Plan-Builders", planName:',
    'builderProgress: "Fortschritt des Plan-Builders", programDuration: "Programmdauer", sessionDuration: "Einheitsdauer", noExercisesAdded: "Keine Übungen", addExercisesToContinue: "Füge mindestens eine Übung hinzu, um fortzufahren", selectedDay: "Ausgewählt", planName:',
    "German visual copy",
)
i18n = replace_once(
    i18n,
    'builderProgress: "تقدم إنشاء الخطة", planName:',
    'builderProgress: "تقدم إنشاء الخطة", programDuration: "مدة البرنامج", sessionDuration: "مدة الجلسة", noExercisesAdded: "لا توجد تمارين", addExercisesToContinue: "أضف تمرينًا واحدًا على الأقل للمتابعة", selectedDay: "محدد", planName:',
    "Arabic visual copy",
)
write("lib/i18n/train.ts", i18n)

# Behavioral helper tests and structural visual contracts.
write(
    "lib/workouts/train-visual.test.ts",
    r'''
import { describe, expect, test } from "vitest";
import { mergeUserFacingExerciseNote, userFacingExerciseNote } from "@/lib/workouts/train-visual";

describe("Train user-facing exercise notes", () => {
  test("hides the legacy source marker while keeping user notes", () => {
    expect(userFacingExerciseNote("Source: plaivra_legacy_workouts\nKeep two reps in reserve.")).toBe("Keep two reps in reserve.");
  });

  test("preserves hidden metadata when the visible note is edited", () => {
    expect(mergeUserFacingExerciseNote("Source: plaivra_legacy_workouts\nOld note", "New note")).toBe("Source: plaivra_legacy_workouts\nNew note");
  });

  test("does not allow the internal source marker to be reintroduced as visible text", () => {
    expect(mergeUserFacingExerciseNote(null, "Source: plaivra_legacy_workouts\nUser note")).toBe("User note");
  });
});
''',
)

write(
    "lib/product/train-post-merge-visual-refinement.test.ts",
    r'''
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Train post-merge visual refinement contracts", () => {
  test("renders concise menu labels while retaining descriptive accessible labels", () => {
    const menu = source("components/ui/action-menu.tsx");
    const overview = source("components/workouts/my-workout-plans.tsx");
    expect(menu).toContain('visibleLabel ?? label.split(":")[0]');
    expect(overview).toContain('visibleLabel={tr("moreActions")}');
  });

  test("uses a full-screen mobile picker and no more than two result columns", () => {
    const dialog = source("components/ui/dialog.tsx");
    const picker = source("components/workouts/exercise-picker-dialog.tsx");
    expect(dialog).toContain("fixed inset-0");
    expect(dialog).toContain("h-dvh");
    expect(picker).toContain("grid grid-cols-1 gap-3 lg:grid-cols-2");
    expect(picker).not.toContain("xl:grid-cols-3");
  });

  test("keeps picker filters wrapping and reserves space for the fixed footer", () => {
    const picker = source("components/workouts/exercise-picker-dialog.tsx");
    expect(picker).toContain("sm:grid-cols-2 lg:grid-cols-4");
    expect(picker).toContain("pb-32");
    expect(picker).toContain("data-picker-footer");
  });

  test("distinguishes Today from the selected week day", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    expect(overview).toContain('aria-current={isToday ? "date" : undefined}');
    expect(overview).toContain("data-week-selected");
    expect(overview).toContain('isSelected ? "border-primary bg-primary/10');
    expect(overview).toContain('isToday ? "border-primary/50 bg-primary/[0.04]');
  });

  test("shows local incomplete-day validation and 44px exercise actions", () => {
    for (const file of ["components/workouts/workout-plan-builder.tsx", "components/workouts/workout-plan-editor.tsx"]) {
      const content = source(file);
      expect(content).toContain('tr("addExercisesToContinue")');
      expect(content).toContain("min-h-11 min-w-11");
      expect(content).toContain("data-exercise-prescription");
    }
  });

  test("filters internal source metadata from builder and editor presentation", () => {
    const helper = source("lib/workouts/train-visual.ts");
    const builder = source("components/workouts/workout-plan-builder.tsx");
    const editor = source("components/workouts/workout-plan-editor.tsx");
    expect(helper).toContain("plaivra_legacy_workouts");
    expect(builder).toContain("userFacingExerciseNote(exercise.notes)");
    expect(editor).toContain("userFacingExerciseNote(exercise.notes)");
  });

  test("includes complete localized visual labels", () => {
    const i18n = source("lib/i18n/train.ts");
    expect(i18n.match(/programDuration:/g)?.length).toBe(3);
    expect(i18n.match(/sessionDuration:/g)?.length).toBe(3);
    expect(i18n.match(/noExercisesAdded:/g)?.length).toBe(3);
    expect(i18n.match(/selectedDay:/g)?.length).toBe(3);
  });
});
''',
)

# A temporary rendered-QA runner is created outside the repository for the staging workflow.
Path("/tmp/run-train-visual-qa.mjs").write_text(
    r'''
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:3000";
const evidenceDir = "/tmp/train-visual-qa";
const activePlanId = "10000000-0000-4000-8000-000000000001";
const languages = ["en", "de", "ar"];
const captures = [
  { surface: "overview", path: "/my-workout/plans", viewports: [[390,844],[768,1024],[1440,900]] },
  { surface: "builder-step-1", path: "/my-workout/plans/builder", viewports: [[390,844],[1440,900]] },
  { surface: "builder-step-2", path: "/my-workout/plans/builder", viewports: [[390,844],[768,1024],[1440,900]], step2: true },
  { surface: "editor", path: `/my-workout/plans/${activePlanId}/edit`, viewports: [[390,844],[768,1024],[1440,900]] },
  { surface: "picker", path: `/my-workout/plans/${activePlanId}/edit?picker=exercise`, viewports: [[360,780],[390,844],[768,1024],[1440,900]], picker: true }
];

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];

for (const language of languages) {
  for (const capture of captures) {
    for (const [width, height] of capture.viewports) {
      if (language !== "en" && !["overview", "picker"].includes(capture.surface)) continue;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", colorScheme: "light" });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.evaluate((nextLanguage) => localStorage.setItem("plaivra.language.v1", nextLanguage), language);
      await page.goto(`${baseUrl}${capture.path}`, { waitUntil: "networkidle", timeout: 45_000 });
      if (capture.step2) {
        const continueButton = page.getByRole("button", { name: /continue|weiter|متابعة/i });
        await continueButton.click();
        await page.waitForTimeout(250);
      }
      if (capture.picker) {
        await page.locator("[data-train-exercise-picker]").waitFor({ state: "visible", timeout: 20_000 });
      }
      await page.waitForTimeout(250);
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const dialog = document.querySelector("[data-train-exercise-picker]");
        const results = document.querySelector("[data-picker-results]");
        const footer = document.querySelector("[data-picker-footer]");
        const scroll = document.querySelector("[data-picker-scroll-region]");
        const unnamed = [...document.querySelectorAll("button, input, select, textarea, [role='button'], a")].filter((element) => {
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;
          const name = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || element.getAttribute("placeholder") || ("labels" in element && element.labels?.length ? "labelled" : "");
          return !String(name || "").trim();
        }).length;
        return {
          horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
          unnamedInteractiveElements: unnamed,
          dialogRect: dialog ? { width: Math.round(dialog.getBoundingClientRect().width), height: Math.round(dialog.getBoundingClientRect().height), top: Math.round(dialog.getBoundingClientRect().top), bottom: Math.round(dialog.getBoundingClientRect().bottom) } : null,
          resultColumns: results ? getComputedStyle(results).gridTemplateColumns.split(" ").filter(Boolean).length : null,
          footerOverlap: footer && scroll ? scroll.getBoundingClientRect().bottom > footer.getBoundingClientRect().bottom + 1 : false,
          direction: getComputedStyle(document.documentElement).direction
        };
      });
      const filename = `${language}-${capture.surface}-${width}x${height}.png`;
      await page.screenshot({ path: path.join(evidenceDir, filename), fullPage: !capture.picker });
      observations.push({ language, surface: capture.surface, viewport: `${width}x${height}`, path: filename, ...metrics });
      await context.close();
    }
  }
}

await browser.close();
const failures = observations.filter((item) => item.horizontalOverflowPx > 1 || item.unnamedInteractiveElements > 0 || (item.surface === "picker" && ((Number(item.viewport.split("x")[0]) < 1024 && (item.dialogRect?.width !== Number(item.viewport.split("x")[0]) || item.dialogRect?.height !== Number(item.viewport.split("x")[1]))) || (item.resultColumns ?? 1) > 2 || item.footerOverlap)));
const report = { generatedAt: new Date().toISOString(), observations, failures, passed: failures.length === 0 };
await writeFile(path.join(evidenceDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Train rendered QA: ${observations.length} captures, ${failures.length} failures.`);
if (failures.length) process.exitCode = 1;
''',
    encoding="utf-8",
)

print("Train visual refinement applied.")
