"use client";

import { CalendarCheck, Dumbbell, ExternalLink, Pencil, Play, Plus, Save, Search, SkipForward, Trash2, TrendingUp } from "lucide-react";
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
import {
  createUserWorkoutPlan,
  getActiveUserWorkoutPlan,
  getCurrentWeekday,
  getWorkoutActivity,
  getWorkoutCategories,
  getWorkouts,
  skipWorkoutDay,
  weekDays,
  workoutsFromPlanDay
} from "@/services/database/repository";
import type { Weekday, Workout, WorkoutSession } from "@/types";

const defaultDays: WeeklyPlanDay[] = [
  { dayName: "Push day", weekday: "Sunday", notes: "", exercises: [] },
  { dayName: "Pull day", weekday: "Tuesday", notes: "", exercises: [] },
  { dayName: "Leg day", weekday: "Thursday", notes: "", exercises: [] }
];

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

export function WorkoutPlanBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [planName, setPlanName] = useState("My workout plan");
  const [days, setDays] = useState<WeeklyPlanDay[]>(defaultDays);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSavedPlan, setIsLoadingSavedPlan] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [activity, setActivity] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    getWorkoutCategories()
      .then(setCategories)
      .catch((error) => {
        setCategories([]);
        toast({ title: "Could not load workout categories", description: error instanceof Error ? error.message : "Please try again." });
      });
  }, [toast]);

  useEffect(() => {
    if (!user) return;
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
  }, [toast, user]);

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

  useEffect(() => {
    if (!selectedCategory) {
      setResults([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      getWorkouts(query.trim(), { category: selectedCategory }, 0)
        .then((items) => {
          if (active) setResults(items.slice(0, 30).map(withTrainingDefaults));
        })
        .catch((error) => {
          if (!active) return;
          setResults([]);
          toast({ title: "Could not load workouts", description: error instanceof Error ? error.message : "Try another category." });
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, selectedCategory, toast]);

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

  function removeDay(index: number) {
    setDays((current) => current.filter((_, itemIndex) => itemIndex !== index).map((day) => ({ ...day, id: undefined, planId: undefined })));
    setActiveDayIndex((current) => Math.max(0, Math.min(current, days.length - 2)));
    setSavedMessage("");
  }

  async function savePlan() {
    setIsSaving(true);
    try {
      await createUserWorkoutPlan({
        userId: user?.id ?? "mock-user",
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
      const skipped = await skipWorkoutDay(user?.id ?? "mock-user", { ...todaysDay, id: todaysDay.id });
      clearStoredValue(workoutStorageKey(["workout-day-session", user?.id ?? "mock-user", todaysDay.id]));
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
          <CardTitle>My workout plan</CardTitle>
          {isLoadingSavedPlan ? <p className="text-sm text-muted-foreground">Loading saved plan...</p> : null}
          {savedMessage ? <p className="text-sm text-emerald-700">{savedMessage}</p> : null}
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
                    <div className="grid gap-2 sm:grid-cols-3">
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
                    </div>
                    {isVideoLink(workout.notes) ? (
                      <a href={workout.notes ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                        Instruction video <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
                <Select value={selectedCategory || undefined} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workouts" className="pl-10" />
                </div>
              </div>

              {!selectedCategory ? <p className="rounded-md border bg-blue-50 p-3 text-sm text-blue-900">Choose a category, then add exercises to the selected weekday.</p> : null}
              {isLoading ? <p className="text-sm text-muted-foreground">Loading workouts...</p> : null}
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
                    <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => addWorkout(workout)}>
                      <Plus className="h-4 w-4" />
                      Add to {activeDay.weekday ?? activeDay.dayName}
                    </Button>
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
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
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
