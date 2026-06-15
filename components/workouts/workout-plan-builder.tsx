"use client";

import { CalendarCheck, Dumbbell, ExternalLink, Pencil, Play, Plus, RotateCcw, Save, Search, SkipForward, SlidersHorizontal, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { WorkoutCalendar, type WeeklyPlanDay } from "@/components/workouts/workout-calendar";
import { clearStoredValue, workoutStorageKey } from "@/lib/workout-persistence";
import Link from "next/link";
import { getWorkoutFilterOptions, getWorkouts, type WorkoutFilterOptions, type WorkoutFilters } from "@/services/database/workout-library";
import {
  createUserWorkoutPlan,
  getActiveUserWorkoutPlan,
  getCurrentWeekday,
  weekDays,
  workoutsFromPlanDay
} from "@/services/database/workout-plans";
import { getWorkoutActivity, skipWorkoutDay } from "@/services/database/workout-sessions";
import type { Weekday, Workout, WorkoutSession } from "@/types";

const defaultDays: WeeklyPlanDay[] = [
  { dayName: "Push day", weekday: "Sunday", notes: "", exercises: [] },
  { dayName: "Pull day", weekday: "Tuesday", notes: "", exercises: [] },
  { dayName: "Leg day", weekday: "Thursday", notes: "", exercises: [] }
];

type BuilderFilterState = {
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

const emptyFilterState: BuilderFilterState = {
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

function isVideoLink(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function workoutIdentity(workout: Workout) {
  return `${workout.name.toLowerCase()}-${(workout.muscle_category || workout.target_muscle).toLowerCase()}-${(workout.equipment_required || workout.equipment).toLowerCase()}`;
}

function selectedList(value: string) {
  return value === allValue ? [] : [value];
}

export function WorkoutPlanBuilder({
  loadActivePlan = true,
  onSaved
}: {
  loadActivePlan?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [planName, setPlanName] = useState("My FitLife plan");
  const [days, setDays] = useState<WeeklyPlanDay[]>(defaultDays);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [filterOptions, setFilterOptions] = useState<WorkoutFilterOptions>(emptyOptions);
  const [filters, setFilters] = useState<BuilderFilterState>(emptyFilterState);
  const [results, setResults] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSavedPlan, setIsLoadingSavedPlan] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [activity, setActivity] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    getWorkoutFilterOptions()
      .then(setFilterOptions)
      .catch((error) => {
        setFilterOptions(emptyOptions);
        toast({ title: "Could not load exercise filters", description: error instanceof Error ? error.message : "Please try again." });
      });
  }, [toast]);

  useEffect(() => {
    if (!user || !loadActivePlan) return;
    let active = true;
    setIsLoadingSavedPlan(true);
    getActiveUserWorkoutPlan(user.id)
      .then((plan) => {
        if (!active || !plan) return;
        setPlanName(plan.name);
        const hydratedDays = plan.days.map((day) => ({
          id: day.id,
          planId: day.plan_id,
          dayName: day.day_name,
          weekday: day.weekday,
          notes: day.notes ?? "",
          exercises: workoutsFromPlanDay(day).map(withTrainingDefaults)
        }));
        setDays(hydratedDays.length ? hydratedDays : defaultDays);
        setSavedMessage(`Loaded saved plan: ${plan.name}`);
      })
      .catch((error) => {
        if (!active) return;
        toast({ title: "Could not load saved plan", description: error instanceof Error ? error.message : "Please try again." });
      })
      .finally(() => {
        if (active) setIsLoadingSavedPlan(false);
      });

    return () => {
      active = false;
    };
  }, [loadActivePlan, toast, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getWorkoutActivity(user.id)
      .then((items) => {
        if (active) setActivity(items);
      })
      .catch((error) => {
        if (!active) return;
        setActivity([]);
        toast({ title: "Could not load workout activity", description: error instanceof Error ? error.message : "Please try again." });
      });
    return () => {
      active = false;
    };
  }, [toast, user]);

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

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([key, value]) => key !== "query" && value !== allValue).length + (filters.query ? 1 : 0),
    [filters]
  );

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      getWorkouts(filters.query.trim(), requestFilters, 0)
        .then((items) => {
          if (active) setResults(items.slice(0, 60).map(withTrainingDefaults));
        })
        .catch((error) => {
          if (!active) return;
          setResults([]);
          toast({ title: "Could not load workouts", description: error instanceof Error ? error.message : "Try another filter." });
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters.query, requestFilters, toast]);

  const activeDay = days[activeDayIndex] ?? days[0];
  const totalExercises = useMemo(() => days.reduce((sum, day) => sum + day.exercises.length, 0), [days]);
  const today = getCurrentWeekday();
  const todaysDay = days.find((day) => day.weekday === today && day.exercises.length > 0);
  const stats = useMemo(() => buildWorkoutStats(activity, days), [activity, days]);

  function updateDay(index: number, patch: Partial<WeeklyPlanDay>) {
    setDays((current) => current.map((day, itemIndex) => (itemIndex === index ? { ...day, ...patch, id: patch.exercises ? undefined : day.id } : day)));
    setSavedMessage("");
  }

  function addDay() {
    setDays((current) => {
      const usedWeekdays = new Set(current.map((day) => day.weekday).filter(Boolean));
      const nextWeekday = weekDays.find((weekday) => !usedWeekdays.has(weekday)) ?? null;
      const nextDays = [...current, { dayName: `Workout day ${current.length + 1}`, weekday: nextWeekday, notes: "", exercises: [] }];
      setActiveDayIndex(nextDays.length - 1);
      return nextDays;
    });
    setSavedMessage("");
  }

  function addWorkout(workout: Workout) {
    const nextWorkout = withTrainingDefaults(workout);
    updateDay(activeDayIndex, {
      exercises: activeDay.exercises.some((item) => workoutIdentity(item) === workoutIdentity(nextWorkout)) ? activeDay.exercises : [...activeDay.exercises, nextWorkout]
    });
  }

  function updateWorkout(workoutId: string, patch: Partial<Workout>) {
    updateDay(activeDayIndex, {
      exercises: activeDay.exercises.map((item) => (item.id === workoutId ? { ...item, ...patch } : item))
    });
  }

  function removeWorkout(workoutId: string) {
    updateDay(activeDayIndex, { exercises: activeDay.exercises.filter((item) => item.id !== workoutId) });
  }

  function patchFilters(patch: Partial<BuilderFilterState>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function resetFilters() {
    setFilters({ ...emptyFilterState });
  }

  function removeDay(index: number) {
    setDays((current) => current.filter((_, itemIndex) => itemIndex !== index).map((day) => ({ ...day, id: undefined, planId: undefined })));
    setActiveDayIndex((current) => Math.max(0, Math.min(current, days.length - 2)));
    setSavedMessage("");
  }

  async function savePlan() {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in before saving workout plans." });
      return;
    }
    setIsSaving(true);
    try {
      await createUserWorkoutPlan({
        userId: user.id,
        planName,
        days
      });
      const savedPlan = user ? await getActiveUserWorkoutPlan(user.id) : null;
      if (savedPlan) {
        setPlanName(savedPlan.name);
        setDays(savedPlan.days.map((day) => ({
          id: day.id,
          planId: day.plan_id,
          dayName: day.day_name,
          weekday: day.weekday,
          notes: day.notes ?? "",
          exercises: workoutsFromPlanDay(day).map(withTrainingDefaults)
        })));
      }
      setSavedMessage("Plan saved.");
      toast({ title: "Workout plan saved", description: `${planName} saved with ${totalExercises} workouts.` });
      await onSaved?.();
    } catch (error) {
      toast({ title: "Could not save plan", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  function startPlanDay(day: WeeklyPlanDay | undefined) {
    if (!day) return;
    if (!day.id) {
      toast({ title: "Save the plan first", description: "Save your workout plan, then start the day session." });
      return;
    }
    router.push(`/workouts/session/day/${day.id}`);
  }

  function editPlanDay(day: WeeklyPlanDay | undefined, fallbackIndex = activeDayIndex) {
    if (!day) return;
    if (!day.id) {
      setActiveDayIndex(fallbackIndex);
      toast({ title: "Save the plan first", description: "Saved workout days open in the dedicated editor." });
      return;
    }
    router.push(`/my-workout/day/${day.id}`);
  }

  function openCalendarDay(index: number) {
    const day = days[index];
    if (day?.id) {
      router.push(`/my-workout/day/${day.id}`);
      return;
    }
    setActiveDayIndex(index);
  }

  function startToday() {
    if (!todaysDay) {
      toast({ title: "No workout for today", description: `Today is ${today}. Add exercises to ${today}, then save the plan.` });
      return;
    }
    startPlanDay(todaysDay);
  }

  async function skipToday() {
    if (!todaysDay) {
      toast({ title: "No workout scheduled today", description: `Today is ${today}.` });
      return;
    }
    if (!todaysDay.id) {
      toast({ title: "Save your plan first", description: "Saved days can be completed or skipped from the calendar." });
      return;
    }
    const existingStatus = latestCurrentWeekStatus(activity, todaysDay.id);
    if (existingStatus === "completed") {
      toast({ title: "Workout already completed", description: "This day is already marked done." });
      return;
    }

    try {
      setIsSkipping(true);
      if (!user?.id) throw new Error("Please sign in before skipping workouts.");
      const skipped = await skipWorkoutDay(user.id, { ...todaysDay, id: todaysDay.id });
      clearStoredValue(workoutStorageKey(["workout-day-session", user.id, todaysDay.id]));
      setActivity((current) => [
        skipped,
        ...current.filter((session) => !(session.plan_day_id === skipped.plan_day_id && isCurrentWeekSession(session)))
      ]);
      const todayIndex = days.findIndex((day) => day.id === todaysDay.id);
      setActiveDayIndex(findNextWorkoutDayIndex(days, todayIndex));
      toast({ title: "Workout skipped", description: "The next workout day is ready." });
    } catch (error) {
      toast({ title: "Could not skip workout", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <div className="space-y-4">
      <WorkoutCalendar
        days={days}
        activity={activity}
        activeDayIndex={activeDayIndex}
        onSelectDay={openCalendarDay}
        onStartToday={startToday}
        onSkipToday={skipToday}
        isSkipping={isSkipping}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Completed days" value={stats.completed} detail={`${stats.completedThisWeek} this week`} />
        <StatCard icon={SkipForward} label="Skipped days" value={stats.skipped} detail={`${stats.skippedThisWeek} this week`} />
        <StatCard icon={TrendingUp} label="Weekly progress" value={`${stats.weeklyPercent}%`} detail={`${stats.completedThisMonth} completed this month`} />
        <StatCard icon={Dumbbell} label="Planned days" value={stats.plannedDays} detail={`${totalExercises} workouts in plan`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workout plan</CardTitle>
          {isLoadingSavedPlan ? <p className="text-sm text-muted-foreground">Loading saved plan...</p> : null}
          {savedMessage ? <p className="text-sm text-success">{savedMessage}</p> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
            <div className="space-y-2">
              <Label>Plan name</Label>
              <Input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Push Pull Legs, Ramadan plan, etc." />
            </div>
            <Button className="self-end" variant="outline" onClick={() => startPlanDay(activeDay)} disabled={!activeDay?.exercises.length}>
              <Play className="h-4 w-4" />
              Start this day
            </Button>
            <Button className="self-end" variant="outline" onClick={() => editPlanDay(activeDay)} disabled={!activeDay?.exercises.length}>
              <Pencil className="h-4 w-4" />
              Edit day
            </Button>
            <Button className="self-end" onClick={savePlan} disabled={isSaving || totalExercises === 0}>
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save plan"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {days.map((day, index) => (
              <Button key={`${day.dayName}-${index}`} variant={activeDayIndex === index ? "default" : "outline"} size="sm" onClick={() => openCalendarDay(index)}>
                {day.weekday ?? `Day ${index + 1}`} <Badge className="ml-2" variant="outline">{day.exercises.length}</Badge>
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={addDay} disabled={days.length >= 7}>
              <Plus className="h-4 w-4" />
              Add day
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-3 rounded-md border bg-slate-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Workout day</Label>
                  <Select value={activeDay.weekday ?? undefined} onValueChange={(weekday) => updateDay(activeDayIndex, { weekday: weekday as Weekday, id: undefined, planId: undefined })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose weekday" />
                    </SelectTrigger>
                    <SelectContent>
                      {weekDays.map((weekday) => (
                        <SelectItem key={weekday} value={weekday}>{weekday}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Day name</Label>
                  <Input value={activeDay.dayName} onChange={(event) => updateDay(activeDayIndex, { dayName: event.target.value, id: undefined, planId: undefined })} placeholder="Push day, Leg day, Day 1..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <textarea
                  value={activeDay.notes}
                  onChange={(event) => updateDay(activeDayIndex, { notes: event.target.value, id: undefined, planId: undefined })}
                  placeholder="Optional notes for this day"
                  className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Selected workouts</Label>
                  {days.length > 1 ? (
                    <Button variant="ghost" size="sm" onClick={() => removeDay(activeDayIndex)}>
                      <Trash2 className="h-4 w-4" />
                      Remove day
                    </Button>
                  ) : null}
                </div>
                {!activeDay.exercises.length ? <p className="text-sm text-muted-foreground">No workouts added to this day yet.</p> : null}
                {activeDay.exercises.map((workout, index) => (
                  <div key={workout.id} className="space-y-3 rounded-md bg-white p-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{index + 1}. {workout.name}</p>
                        <p className="text-muted-foreground">{workout.target_muscle} | {workout.equipment}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeWorkout(workout.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1">
                        <Label>Sets</Label>
                        <Input
                          type="number"
                          min="1"
                          value={workout.sets ?? 3}
                          onChange={(event) => updateWorkout(workout.id, { sets: Math.max(1, Number(event.target.value) || 1) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Planned reps</Label>
                        <Input value={workout.reps ?? "8-12"} onChange={(event) => updateWorkout(workout.id, { reps: event.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Rest seconds</Label>
                        <Input
                          type="number"
                          min="0"
                          value={workout.rest_seconds ?? 75}
                          onChange={(event) => updateWorkout(workout.id, { rest_seconds: Math.max(0, Number(event.target.value) || 0) })}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2 xl:col-span-1">
                        <Label>Custom video URL</Label>
                        <Input
                          value={workout.custom_video_url ?? ""}
                          onChange={(event) => updateWorkout(workout.id, { custom_video_url: event.target.value, video_url: event.target.value })}
                          placeholder="Optional user-added URL"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isVideoLink(workout.exercise_url || workout.notes) ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={workout.exercise_url || workout.notes || "#"} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open Exercise Guide
                          </a>
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled>No guide added</Button>
                      )}
                      {workout.custom_video_url ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={workout.custom_video_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open Custom Video
                          </a>
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled>No custom video</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-3 rounded-md border bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 text-primary" />
                    <p className="font-semibold text-slate-950">Exercise filters</p>
                    {activeFilterCount ? <Badge>{activeFilterCount} selected</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{results.length} exercises loaded</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                    <Input
                      value={filters.query}
                      onChange={(event) => patchFilters({ query: event.target.value })}
                      placeholder="Search workouts"
                      className="pl-10"
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={resetFilters} disabled={!activeFilterCount}>
                    <RotateCcw className="h-4 w-4" />
                    Clear filters
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  <FilterSelect label="Muscle category" value={filters.muscleCategory} values={filterOptions.muscleCategories} onChange={(muscleCategory) => patchFilters({ muscleCategory })} />
                  <FilterSelect label="Primary muscle" value={filters.primaryMuscle} values={filterOptions.primaryMuscles} onChange={(primaryMuscle) => patchFilters({ primaryMuscle })} />
                  <FilterSelect label="Secondary muscle" value={filters.secondaryMuscle} values={filterOptions.secondaryMuscles} onChange={(secondaryMuscle) => patchFilters({ secondaryMuscle })} />
                  <FilterSelect label="Equipment" value={filters.equipment} values={filterOptions.equipmentRequired} onChange={(equipment) => patchFilters({ equipment })} />
                  <FilterSelect label="Mechanics" value={filters.mechanics} values={filterOptions.mechanics} onChange={(mechanics) => patchFilters({ mechanics })} />
                  <FilterSelect label="Exercise type" value={filters.exerciseType} values={filterOptions.exerciseTypes} onChange={(exerciseType) => patchFilters({ exerciseType })} />
                  <FilterSelect label="Force type" value={filters.forceType} values={filterOptions.forceTypes} onChange={(forceType) => patchFilters({ forceType })} />
                  <FilterSelect label="Difficulty / level" value={filters.level} values={filterOptions.experienceLevels} onChange={(level) => patchFilters({ level })} />
                </div>
              </div>

              {isLoading ? <p className="text-sm text-muted-foreground">Loading workouts...</p> : null}
              {!isLoading && !results.length ? <p className="text-sm text-muted-foreground">No exercises match these filters.</p> : null}
              <div className="grid gap-3 md:grid-cols-2">
                {results.map((workout) => (
                  <div key={workout.id} className="rounded-md border bg-white p-3">
                    <div className="flex items-start gap-2">
                      <Dumbbell className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="font-semibold">{workout.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{workout.target_muscle} | {workout.equipment}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{workout.sets ?? 3} sets</Badge>
                      <Badge variant="outline">{workout.reps ?? "8-12"}</Badge>
                      <Badge variant="outline">{workout.rest_seconds ?? 75}s rest</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" size="sm" onClick={() => addWorkout(workout)}>
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/workouts/${workout.id}`}>Details</Link>
                      </Button>
                      {isVideoLink(workout.exercise_url || workout.notes) ? (
                        <Button asChild variant="ghost" size="sm" className="sm:col-span-2">
                          <a href={workout.exercise_url || workout.notes || "#"} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open Exercise Guide
                          </a>
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="sm:col-span-2" disabled>
                          No guide added
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
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
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
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
    </div>
  );
}

function buildWorkoutStats(activity: WorkoutSession[], days: WeeklyPlanDay[]) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const plannedDays = days.filter((day) => day.exercises.length > 0).length;

  const completed = activity.filter((session) => session.status === "completed");
  const skipped = activity.filter((session) => session.status === "skipped");
  const completedThisWeek = completed.filter((session) => sessionDate(session) >= weekStart).length;
  const skippedThisWeek = skipped.filter((session) => sessionDate(session) >= weekStart).length;
  const completedThisMonth = completed.filter((session) => sessionDate(session) >= monthStart).length;

  return {
    completed: completed.length,
    skipped: skipped.length,
    completedThisWeek,
    skippedThisWeek,
    completedThisMonth,
    plannedDays,
    weeklyPercent: plannedDays ? Math.min(100, Math.round((completedThisWeek / plannedDays) * 100)) : 0
  };
}

function sessionDate(session: WorkoutSession) {
  return new Date(session.completed_at || session.skipped_at || session.started_at);
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function findNextWorkoutDayIndex(days: WeeklyPlanDay[], currentIndex: number) {
  if (!days.length) return 0;
  for (let offset = 1; offset <= days.length; offset += 1) {
    const nextIndex = (Math.max(0, currentIndex) + offset) % days.length;
    if (days[nextIndex]?.exercises.length) return nextIndex;
  }
  return Math.max(0, currentIndex);
}

function latestCurrentWeekStatus(activity: WorkoutSession[], planDayId: string) {
  const match = activity
    .filter((session) => session.plan_day_id === planDayId && isCurrentWeekSession(session))
    .sort((a, b) => sessionDate(b).getTime() - sessionDate(a).getTime())[0];
  return match?.status ?? null;
}

function isCurrentWeekSession(session: WorkoutSession) {
  const date = sessionDate(session);
  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return date >= weekStart && date < weekEnd;
}
