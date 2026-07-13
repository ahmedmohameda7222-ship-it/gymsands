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
      // Result-derived options below remain available if filter metadata fails.
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

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent layout="responsive-drawer" className="max-w-5xl" closeLabel={tr("closePicker")} dir={dir}>
      <DialogHeader className="border-b px-5 py-4 text-start"><DialogTitle>{tr("addExercisesTo", { day: dayName })}</DialogTitle><DialogDescription>{tr("selectionPreserved", { count: selected.size })}</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28 sm:px-5">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_180px_160px]">
          <label className="relative"><span className="sr-only">{tr("searchExercises")}</span><Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 ps-10" placeholder={tr("searchExercises")} /></label>
          <Select aria-label={tr("primaryMuscle")} value={muscle} onChange={setMuscle} placeholder={tr("primaryMuscle")} options={muscleOptions} />
          <Select aria-label={tr("equipment")} value={equipment} onChange={setEquipment} placeholder={tr("equipment")} options={equipmentOptions} />
          <Select aria-label={tr("difficulty")} value={difficulty} onChange={setDifficulty} placeholder={tr("difficulty")} options={difficultyOptions} />
        </div>
        <details className="mt-3 rounded-2xl border bg-card p-3">
          <summary className="min-h-11 cursor-pointer select-none content-center font-medium">{tr("moreFilters")}</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Select aria-label={tr("muscleCategory")} value={muscleCategory} onChange={setMuscleCategory} placeholder={tr("muscleCategory")} options={muscleCategoryOptions} />
            <Select aria-label={tr("secondaryMuscle")} value={secondaryMuscle} onChange={setSecondaryMuscle} placeholder={tr("secondaryMuscle")} options={secondaryMuscleOptions} />
            <Select aria-label={tr("forceType")} value={forceType} onChange={setForceType} placeholder={tr("forceType")} options={forceTypeOptions} />
            <Select aria-label={tr("exerciseType")} value={exerciseType} onChange={setExerciseType} placeholder={tr("exerciseType")} options={exerciseTypeOptions} />
            <Select aria-label={tr("mechanics")} value={mechanics} onChange={setMechanics} placeholder={tr("mechanics")} options={mechanicsOptions} />
          </div>
        </details>
        {loading ? <div className="mt-4"><CardGridSkeleton count={3} rows={3} /></div> : null}
        {error ? <div role="alert" className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</div> : null}
        {!loading && !error ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{results.map((exercise) => {
          const key = exerciseKey(exercise);
          const duplicate = existing.has(key);
          const isSelected = selected.has(key);
          const guideUrl = exercise.custom_video_url || exercise.video_url || exercise.exercise_url;
          return <article key={key} className={`rounded-2xl border p-4 ${isSelected ? "border-primary bg-primary/5" : "bg-card"}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{exercise.name}</h3><p className="mt-1 text-sm text-muted-foreground">{exercise.target_muscle} · {exercise.equipment}</p></div><Badge variant="outline">{exercise.difficulty}</Badge></div><p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{exercise.instructions}</p><div className={`mt-4 grid gap-2 ${guideUrl ? "grid-cols-2" : "grid-cols-1"}`}><Button type="button" variant={isSelected ? "default" : "outline"} className="min-h-11 w-full" disabled={duplicate} aria-pressed={isSelected} onClick={() => toggle(exercise)}>{duplicate ? <Check className="h-4 w-4" /> : isSelected ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{duplicate ? tr("alreadyAdded") : isSelected ? tr("deselect") : tr("select")}</Button>{guideUrl ? <Button asChild type="button" variant="ghost" className="min-h-11"><a href={guideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{tr("viewGuide")}</a></Button> : null}</div></article>;
        })}</div> : null}
        {!loading && !error && !results.length ? <div className="mt-4 grid min-h-40 place-items-center rounded-2xl border border-dashed text-center"><div><Dumbbell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">{tr("noExercisesFound")}</p><p className="text-sm text-muted-foreground">{tr("broaderSearch")}</p></div></div> : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur"><Button type="button" variant="ghost" onClick={() => setSelected(new Map())} disabled={!selected.size}>{tr("clear")}</Button><Button type="button" className="min-h-12" onClick={addSelected} disabled={!selected.size}>{tr("addNExercises", { count: selected.size })}</Button></div>
    </DialogContent>
  </Dialog>;
}

export { exerciseKey };
