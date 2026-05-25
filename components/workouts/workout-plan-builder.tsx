"use client";

import { Plus, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { createUserWorkoutPlan, getWorkoutCategories, getWorkouts } from "@/services/database/repository";
import type { Workout } from "@/types";

type PlanDay = {
  dayName: string;
  notes: string;
  exercises: Workout[];
};

const defaultDays: PlanDay[] = [
  { dayName: "Day 1", notes: "", exercises: [] },
  { dayName: "Day 2", notes: "", exercises: [] },
  { dayName: "Day 3", notes: "", exercises: [] }
];

export function WorkoutPlanBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [planName, setPlanName] = useState("My workout plan");
  const [days, setDays] = useState<PlanDay[]>(defaultDays);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getWorkoutCategories()
      .then(setCategories)
      .catch((error) => {
        setCategories([]);
        toast({ title: "Could not load workout categories", description: error instanceof Error ? error.message : "Please try again." });
      });
  }, [toast]);

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
          if (active) setResults(items.slice(0, 30));
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

  function updateDay(index: number, patch: Partial<PlanDay>) {
    setDays((current) => current.map((day, itemIndex) => (itemIndex === index ? { ...day, ...patch } : day)));
  }

  function addDay() {
    setDays((current) => [...current, { dayName: `Day ${current.length + 1}`, notes: "", exercises: [] }]);
    setActiveDayIndex(days.length);
  }

  function addWorkout(workout: Workout) {
    updateDay(activeDayIndex, {
      exercises: activeDay.exercises.some((item) => item.id === workout.id)
        ? activeDay.exercises
        : [...activeDay.exercises, workout]
    });
  }

  function removeWorkout(workoutId: string) {
    updateDay(activeDayIndex, { exercises: activeDay.exercises.filter((item) => item.id !== workoutId) });
  }

  async function savePlan() {
    setIsSaving(true);
    try {
      await createUserWorkoutPlan({
        userId: user?.id ?? "mock-user",
        planName,
        days
      });
      toast({ title: "Workout plan saved", description: `${planName} saved with ${totalExercises} workouts.` });
    } catch (error) {
      toast({ title: "Could not save plan", description: error instanceof Error ? error.message : "Please check the SQL migration." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your own workout plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Plan name</Label>
            <Input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Push Pull Legs, Ramadan plan, etc." />
          </div>
          <Button className="self-end" onClick={savePlan} disabled={isSaving || totalExercises === 0}>
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save plan"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {days.map((day, index) => (
            <Button key={`${day.dayName}-${index}`} variant={activeDayIndex === index ? "default" : "outline"} size="sm" onClick={() => setActiveDayIndex(index)}>
              {day.dayName || `Day ${index + 1}`} <Badge className="ml-2" variant="outline">{day.exercises.length}</Badge>
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={addDay}>
            <Plus className="h-4 w-4" />
            Add day
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3 rounded-md border bg-slate-50 p-3">
            <div className="space-y-2">
              <Label>Day name</Label>
              <Input value={activeDay.dayName} onChange={(event) => updateDay(activeDayIndex, { dayName: event.target.value })} placeholder="Push day, Leg day, Day 1..." />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <textarea
                value={activeDay.notes}
                onChange={(event) => updateDay(activeDayIndex, { notes: event.target.value })}
                placeholder="Optional notes for this day"
                className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label>Selected workouts</Label>
              {!activeDay.exercises.length ? <p className="text-sm text-muted-foreground">No workouts added to this day yet.</p> : null}
              {activeDay.exercises.map((workout, index) => (
                <div key={workout.id} className="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm">
                  <div>
                    <p className="font-semibold">{index + 1}. {workout.name}</p>
                    <p className="text-muted-foreground">{workout.target_muscle} | {workout.equipment}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeWorkout(workout.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
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

            {!selectedCategory ? <p className="rounded-md border bg-blue-50 p-3 text-sm text-blue-900">Choose a category first, then add exercises to the selected day.</p> : null}
            {isLoading ? <p className="text-sm text-muted-foreground">Loading workouts...</p> : null}
            <div className="grid gap-3 md:grid-cols-2">
              {results.map((workout) => (
                <div key={workout.id} className="rounded-md border bg-white p-3">
                  <p className="font-semibold">{workout.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{workout.target_muscle} | {workout.equipment}</p>
                  <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => addWorkout(workout)}>
                    <Plus className="h-4 w-4" />
                    Add to {activeDay.dayName || "day"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
