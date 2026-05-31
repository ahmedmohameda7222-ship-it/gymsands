"use client";

import Link from "next/link";
import { ExternalLink, Play, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getWorkoutFilterOptions, getWorkouts, type WorkoutFilterOptions, type WorkoutFilters } from "@/services/database/repository";
import { useToast } from "@/components/ui/toaster";
import type { Workout } from "@/types";

const pageSize = 60;

type FilterKey = "categories" | "equipmentRequired" | "mechanics" | "forceTypes" | "experienceLevels" | "secondaryMuscles";

const emptyFilters: Record<FilterKey, string[]> = {
  categories: [],
  equipmentRequired: [],
  mechanics: [],
  forceTypes: [],
  experienceLevels: [],
  secondaryMuscles: []
};

const emptyOptions: WorkoutFilterOptions = {
  muscleCategories: [],
  equipmentRequired: [],
  mechanics: [],
  forceTypes: [],
  experienceLevels: [],
  secondaryMuscles: []
};

function isLink(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function WorkoutBrowser() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState<WorkoutFilterOptions>(emptyOptions);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>(emptyFilters);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    getWorkoutFilterOptions()
      .then(setFilterOptions)
      .catch((error) => {
        setFilterOptions(emptyOptions);
        toast({
          title: "Could not load workout filters",
          description: error instanceof Error ? error.message : "Please try again."
        });
      });
  }, [toast]);

  const activeFilterCount = useMemo(() => Object.values(filters).reduce((sum, values) => sum + values.length, 0), [filters]);
  const requestFilters: WorkoutFilters = filters;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setPage(0);
      getWorkouts(query.trim(), requestFilters, 0)
        .then((items) => {
          if (!active) return;
          setWorkouts(items);
          setHasMore(items.length >= pageSize);
        })
        .catch((error) => {
          if (!active) return;
          setWorkouts([]);
          toast({
            title: "Could not load workouts",
            description: error instanceof Error ? error.message : "Try another search or filter."
          });
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, query, requestFilters, toast]);

  async function loadMore() {
    const nextPage = page + 1;
    setIsLoading(true);
    try {
      const items = await getWorkouts(query.trim(), requestFilters, nextPage);
      setWorkouts((current) => [...current, ...items]);
      setPage(nextPage);
      setHasMore(items.length >= pageSize);
    } catch (error) {
      toast({
        title: "Could not load more workouts",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  }

  function toggleFilter(key: FilterKey, value: string) {
    setFilters((current) => {
      const values = current[key];
      const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [key]: nextValues };
    });
  }

  function resetFilters() {
    setQuery("");
    setFilters(emptyFilters);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search exercises by name, muscle, equipment, mechanics, or force type"
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={resetFilters} disabled={!query && activeFilterCount === 0}>
          <RotateCcw className="h-4 w-4" />
          Reset filters
        </Button>
      </div>

      <div className="rounded-md border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <p className="font-semibold text-slate-950">Exercise filters</p>
            {activeFilterCount ? <Badge>{activeFilterCount} selected</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{workouts.length} exercises loaded</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <FilterGroup title="Muscle Category" values={filterOptions.muscleCategories} selected={filters.categories} onToggle={(value) => toggleFilter("categories", value)} />
          <FilterGroup title="Equipment Required" values={filterOptions.equipmentRequired} selected={filters.equipmentRequired} onToggle={(value) => toggleFilter("equipmentRequired", value)} />
          <FilterGroup title="Mechanics" values={filterOptions.mechanics} selected={filters.mechanics} onToggle={(value) => toggleFilter("mechanics", value)} />
          <FilterGroup title="Force Type" values={filterOptions.forceTypes} selected={filters.forceTypes} onToggle={(value) => toggleFilter("forceTypes", value)} />
          <FilterGroup title="Experience Level" values={filterOptions.experienceLevels} selected={filters.experienceLevels} onToggle={(value) => toggleFilter("experienceLevels", value)} />
          <FilterGroup title="Secondary Muscles" values={filterOptions.secondaryMuscles} selected={filters.secondaryMuscles} onToggle={(value) => toggleFilter("secondaryMuscles", value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && !workouts.length ? <p className="text-sm text-muted-foreground">Loading workouts...</p> : null}
        {!isLoading && !workouts.length ? <p className="text-sm text-muted-foreground">No workouts match these filters.</p> : null}
        {workouts.map((workout) => {
          const guideUrl = workout.exercise_url || (isLink(workout.notes) ? workout.notes : null);
          return (
            <Card key={workout.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">{workout.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{workout.muscle_category || workout.target_muscle}</p>
                  </div>
                  <Badge>{workout.experience_level || workout.difficulty}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="outline">{workout.equipment_required || workout.equipment}</Badge>
                  {workout.mechanics ? <Badge variant="outline">{workout.mechanics}</Badge> : null}
                  {workout.force_type ? <Badge variant="outline">{workout.force_type}</Badge> : null}
                  {workout.sets ? <Badge variant="outline">{workout.sets} sets</Badge> : null}
                  {workout.reps ? <Badge variant="outline">{workout.reps}</Badge> : null}
                </div>
                {workout.secondary_muscles?.length ? (
                  <p className="mt-3 text-xs text-muted-foreground">Secondary: {workout.secondary_muscles.join(", ")}</p>
                ) : null}
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{workout.instructions}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="outline">
                    <Link href={`/workouts/${workout.id}`}>Details</Link>
                  </Button>
                  <Button asChild>
                    <Link href={`/workouts/session/${workout.id}`}>
                      <Play className="h-4 w-4" />
                      Start
                    </Link>
                  </Button>
                  {guideUrl ? (
                    <Button asChild variant="ghost" className="sm:col-span-2">
                      <a href={guideUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open Exercise Guide
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={isLoading}>
            {isLoading ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterGroup({
  title,
  values,
  selected,
  onToggle
}: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {selected.length ? <Badge variant="outline">{selected.length}</Badge> : null}
      </div>
      <div className="grid max-h-44 gap-2 overflow-y-auto pr-1">
        {values.map((value) => (
          <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition hover:bg-white">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
              className="h-4 w-4 rounded border-slate-300 text-primary"
            />
            <span className="min-w-0 truncate">{value}</span>
          </label>
        ))}
        {!values.length ? <p className="text-sm text-muted-foreground">No options yet.</p> : null}
      </div>
    </div>
  );
}
