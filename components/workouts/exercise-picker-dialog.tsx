"use client";

import { Check, Dumbbell, ExternalLink, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const returnFocusRef = useRef<HTMLElement | null>(null);
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
        className="inset-x-0 bottom-0 top-0 h-dvh max-h-dvh w-screen max-w-none rounded-none border-0 sm:inset-x-0 sm:bottom-0 sm:top-0 sm:h-dvh sm:max-h-dvh sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(54rem,100vw)] lg:max-w-[54rem] lg:translate-x-0 lg:translate-y-0 lg:rounded-none lg:border-y-0 lg:border-l lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r"
        closeLabel={tr("closePicker")}
        dir={dir}
        data-train-exercise-picker
        onOpenAutoFocus={() => {
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLElement && !activeElement.closest("[data-train-exercise-picker]")) {
            returnFocusRef.current = activeElement;
          }
        }}
        onCloseAutoFocus={(event) => {
          const returnTarget = returnFocusRef.current;
          if (!returnTarget) return;
          event.preventDefault();
          window.requestAnimationFrame(() => returnTarget.focus());
        }}
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

        <div className="absolute inset-x-0 bottom-0 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5" data-picker-footer>
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
