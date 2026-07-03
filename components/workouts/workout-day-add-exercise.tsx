"use client";

import { ArrowLeft, Check, ExternalLink, Plus, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { readStoredJson, storeJson, workoutStorageKey } from "@/lib/workout-persistence";
import Link from "next/link";
import { getWorkoutFilterOptions, getWorkouts, type WorkoutFilterOptions, type WorkoutFilters } from "@/services/database/workout-library";
import { workoutsFromPlanDay } from "@/services/database/workout-plans";
import type { Weekday, Workout, WorkoutPlanDaySession } from "@/types";

type EditorDraft = {
  dayName: string;
  weekday: Weekday | null;
  notes: string;
  exercises: Workout[];
};

type AddFilterState = {
  query: string;
  muscleCategory: string;
  primaryMuscle: string;
  secondaryMuscle: string;
  forceType: string;
  exerciseType: string;
  equipment: string;
  mechanics: string;
  level: string;
};

const allValue = "all";

const emptyOptions: WorkoutFilterOptions = {
  muscleCategories: [],
  primaryMuscles: [],
  equipmentRequired: [],
  mechanics: [],
  exerciseTypes: [],
  forceTypes: [],
  experienceLevels: [],
  secondaryMuscles: []
};

const emptyFilterState: AddFilterState = {
  query: "",
  muscleCategory: allValue,
  primaryMuscle: allValue,
  secondaryMuscle: allValue,
  forceType: allValue,
  exerciseType: allValue,
  equipment: allValue,
  mechanics: allValue,
  level: allValue
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

function exerciseKey(workout: Workout) {
  return `${workout.name.toLowerCase()}-${(workout.muscle_category || workout.target_muscle).toLowerCase()}-${(workout.equipment_required || workout.equipment).toLowerCase()}`;
}

function isLink(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function selectedList(value: string) {
  return value === allValue ? [] : [value];
}

export function WorkoutDayAddExercise({ day }: { day: WorkoutPlanDaySession }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const draftKey = useMemo(() => workoutStorageKey(["workout-day-draft", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const filterKey = useMemo(() => workoutStorageKey(["workout-day-add-filter", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const [draft, setDraft] = useState<EditorDraft>(() => draftFromDay(day));
  const [filters, setFilters] = useState<AddFilterState>(emptyFilterState);
  const [filterOptions, setFilterOptions] = useState<WorkoutFilterOptions>(emptyOptions);
  const [results, setResults] = useState<Workout[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  useEffect(() => {
    const storedDraft = readStoredJson<EditorDraft>(draftKey);
    const storedFilters = readStoredJson<AddFilterState>(filterKey);
    setDraft(storedDraft ?? draftFromDay(day));
    setFilters({ ...emptyFilterState, ...(storedFilters ?? {}) });
    setIsHydrated(true);
  }, [day, draftKey, filterKey]);

  useEffect(() => {
    if (!isHydrated) return;
    storeJson(draftKey, draft);
  }, [draft, draftKey, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    storeJson(filterKey, filters);
  }, [filterKey, filters, isHydrated]);

  useEffect(() => {
    getWorkoutFilterOptions()
      .then(setFilterOptions)
      .catch((error) => {
        setFilterOptions(emptyOptions);
        toast({ title: "Could not load exercise filters", description: userSafeError(error, "Please refresh and try again.") });
      });
  }, [toast]);

  const requestFilters: WorkoutFilters = useMemo(
    () => ({
      muscleCategories: selectedList(filters.muscleCategory),
      primaryMuscles: selectedList(filters.primaryMuscle),
      secondaryMuscles: selectedList(filters.secondaryMuscle),
      forceTypes: selectedList(filters.forceType),
      exerciseTypes: selectedList(filters.exerciseType),
      equipmentRequired: selectedList(filters.equipment),
      mechanics: selectedList(filters.mechanics),
      experienceLevels: selectedList(filters.level)
    }),
    [filters.equipment, filters.exerciseType, filters.forceType, filters.level, filters.mechanics, filters.muscleCategory, filters.primaryMuscle, filters.secondaryMuscle]
  );

  useEffect(() => {
    if (!isHydrated) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoadingResults(true);
      getWorkouts(filters.query.trim(), requestFilters, 0)
        .then((items) => {
          if (active) setResults(items.slice(0, 60).map(withTrainingDefaults));
        })
        .catch((error) => {
          if (!active) return;
          setResults([]);
          toast({ title: "Could not load exercises", description: userSafeError(error, "Please try another filter.") });
        })
        .finally(() => {
          if (active) setIsLoadingResults(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters.query, isHydrated, requestFilters, toast]);

  const addedKeys = useMemo(() => new Set(draft.exercises.map(exerciseKey)), [draft.exercises]);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== "query" && value !== allValue).length + (filters.query ? 1 : 0);

  function patchFilters(patch: Partial<AddFilterState>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function addExercise(workout: Workout) {
    const nextWorkout = withTrainingDefaults(workout);
    const key = exerciseKey(nextWorkout);
    setDraft((current) => {
      if (current.exercises.some((item) => exerciseKey(item) === key)) {
        toast({ title: "Exercise already added", description: `${nextWorkout.name} is already in this workout day.` });
        return current;
      }
      return { ...current, exercises: [...current.exercises, nextWorkout] };
    });
  }

  function resetFilters() {
    setFilters(emptyFilterState);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href={`/my-workout/day/${day.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to workout day
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Badge>{draft.exercises.length} exercises in day</Badge>
          {activeFilterCount ? <Badge variant="outline">{activeFilterCount} filters</Badge> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Browse exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                value={filters.query}
                onChange={(event) => patchFilters({ query: event.target.value })}
                placeholder="Search by exercise name"
                className="pl-10"
              />
            </div>
            <Button type="button" variant="outline" onClick={resetFilters} disabled={!activeFilterCount}>
              <RotateCcw className="h-4 w-4" />
              Clear filters
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterSelect label="Muscle category" value={filters.muscleCategory} values={filterOptions.muscleCategories} onChange={(muscleCategory) => patchFilters({ muscleCategory })} />
            <FilterSelect label="Primary muscle" value={filters.primaryMuscle} values={filterOptions.primaryMuscles} onChange={(primaryMuscle) => patchFilters({ primaryMuscle })} />
            <FilterSelect label="Secondary muscle" value={filters.secondaryMuscle} values={filterOptions.secondaryMuscles} onChange={(secondaryMuscle) => patchFilters({ secondaryMuscle })} />
            <FilterSelect label="Force type" value={filters.forceType} values={filterOptions.forceTypes} onChange={(forceType) => patchFilters({ forceType })} />
            <FilterSelect label="Exercise type" value={filters.exerciseType} values={filterOptions.exerciseTypes} onChange={(exerciseType) => patchFilters({ exerciseType })} />
            <FilterSelect label="Equipment" value={filters.equipment} values={filterOptions.equipmentRequired} onChange={(equipment) => patchFilters({ equipment })} />
            <FilterSelect label="Mechanics" value={filters.mechanics} values={filterOptions.mechanics} onChange={(mechanics) => patchFilters({ mechanics })} />
            <FilterSelect label="Difficulty / level" value={filters.level} values={filterOptions.experienceLevels} onChange={(level) => patchFilters({ level })} />
          </div>
        </CardContent>
      </Card>

      {isLoadingResults ? <p className="text-sm text-muted-foreground">Loading exercises...</p> : null}
      {!isLoadingResults && !results.length ? <p className="text-sm text-muted-foreground">No exercises match these filters.</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {results.map((workout) => {
          const guideUrl = workout.exercise_url || (isLink(workout.notes) ? workout.notes : null);
          const isAdded = addedKeys.has(exerciseKey(workout));
          return (
            <Card key={workout.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{workout.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {workout.muscle_category || workout.target_muscle} | {workout.equipment_required || workout.equipment}
                    </p>
                  </div>
                  <Badge>{workout.experience_level || workout.difficulty}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {workout.mechanics ? <Badge variant="outline">{workout.mechanics}</Badge> : null}
                  {workout.force_type ? <Badge variant="outline">{workout.force_type}</Badge> : null}
                  {workout.secondary_muscles?.slice(0, 2).map((muscle) => <Badge key={muscle} variant="outline">{muscle}</Badge>)}
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{workout.instructions}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={() => addExercise(workout)}
                    disabled={isAdded}
                    className={isAdded ? "bg-success text-success-foreground hover:bg-success disabled:opacity-100" : undefined}
                  >
                    {isAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {isAdded ? "Added" : "Add"}
                  </Button>
                  {guideUrl ? (
                    <Button asChild variant="outline">
                      <a href={guideUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open Guide
                      </a>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" disabled>
                      No guide
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  values,
  onChange
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>All {label.toLowerCase()}</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item}>{item}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
