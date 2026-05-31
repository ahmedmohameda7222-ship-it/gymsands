"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, CheckCircle2, ClipboardCheck, Clock, Dumbbell, Loader2, RefreshCcw, SkipForward, Sparkles, TimerReset, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { clearStoredValue, readStoredTimestamp, storeTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import {
  completeGeneratedWorkoutSession,
  getGeneratedWorkoutPlan,
  skipGeneratedWorkoutSession,
  type GeneratedExerciseLogInput
} from "@/services/database/repository";
import { cn } from "@/lib/utils";
import type { GeneratedWorkoutPlan, UserWorkoutSession } from "@/types";

type ExerciseInput = {
  workoutTemplateExerciseId: string | null;
  planExerciseId: string | null;
  exerciseOrder: number;
  exerciseName: string;
  plannedSets: string | null;
  plannedReps: string | null;
  weightKg: string;
  reps: string;
  notes: string;
  completed: boolean;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function statusClass(status: UserWorkoutSession["status"]) {
  if (status === "completed") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (status === "skipped") return "border-amber-300 bg-amber-50 text-amber-950";
  if (status === "started") return "border-sky-300 bg-sky-50 text-sky-950";
  return "border-slate-200 bg-white text-slate-800";
}

function sessionDate(session: UserWorkoutSession) {
  return new Date(session.completed_at || session.skipped_at || session.started_at || `${session.scheduled_date}T00:00:00`);
}

function firstReps(value: string | null | undefined) {
  return value?.match(/\d+/)?.[0] ?? "";
}

function exercisesForSession(plan: GeneratedWorkoutPlan, session: UserWorkoutSession | null) {
  if (!session) return [];
  const templateDay = plan.template?.days.find((day) => day.id === session.workout_template_day_id || day.day_index === session.day_index);
  const planDay = plan.days.find((day) => day.id === session.plan_day_id || day.day_number === session.day_index);

  if (templateDay?.exercises.length) {
    return templateDay.exercises.map((exercise) => {
      const planExercise = planDay?.exercises.find(
        (item) => item.source_workout_id === exercise.id || item.sort_order === exercise.exercise_order
      );
      return {
        workoutTemplateExerciseId: exercise.id,
        planExerciseId: planExercise?.id ?? null,
        exerciseOrder: exercise.exercise_order,
        exerciseName: exercise.exercise_name,
        plannedSets: exercise.sets,
        plannedReps: exercise.reps
      };
    });
  }

  return (planDay?.exercises ?? []).map((exercise) => ({
    workoutTemplateExerciseId: null,
    planExerciseId: exercise.id,
    exerciseOrder: exercise.sort_order,
    exerciseName: exercise.exercise_name,
    plannedSets: exercise.sets ? String(exercise.sets) : null,
    plannedReps: exercise.reps
  }));
}

function hydrateInputs(
  plan: GeneratedWorkoutPlan,
  session: UserWorkoutSession | null
): ExerciseInput[] {
  const base = exercisesForSession(plan, session);
  return base.map((exercise) => {
    const saved = session?.logs.find(
      (log) =>
        log.workout_template_exercise_id === exercise.workoutTemplateExerciseId ||
        log.plan_exercise_id === exercise.planExerciseId ||
        log.exercise_order === exercise.exerciseOrder
    );
    return {
      ...exercise,
      weightKg: saved?.weight_kg === null || saved?.weight_kg === undefined ? "" : String(saved.weight_kg),
      reps: saved?.reps === null || saved?.reps === undefined ? firstReps(exercise.plannedReps) : String(saved.reps),
      notes: saved?.notes ?? "",
      completed: saved?.completed ?? false
    };
  });
}

function chooseActiveSession(sessions: UserWorkoutSession[]) {
  const open = sessions
    .filter((session) => session.status === "scheduled" || session.status === "started")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.session_number - b.session_number);
  const today = todayKey();
  return open.find((session) => session.scheduled_date === today) ?? open.find((session) => session.scheduled_date <= today) ?? open[0] ?? null;
}

function buildStats(sessions: UserWorkoutSession[]) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completed = sessions.filter((session) => session.status === "completed");
  const skipped = sessions.filter((session) => session.status === "skipped");
  const completedThisWeek = completed.filter((session) => sessionDate(session) >= weekStart).length;
  const skippedThisWeek = skipped.filter((session) => sessionDate(session) >= weekStart).length;
  const completedThisMonth = completed.filter((session) => sessionDate(session) >= monthStart).length;
  const scheduledThisMonth = sessions.filter((session) => new Date(`${session.scheduled_date}T00:00:00`) >= monthStart).length;

  return {
    completed: completed.length,
    skipped: skipped.length,
    completedThisWeek,
    skippedThisWeek,
    completedThisMonth,
    completionPercent: sessions.length ? Math.round((completed.length / sessions.length) * 100) : 0,
    monthlyPercent: scheduledThisMonth ? Math.round((completedThisMonth / scheduledThisMonth) * 100) : 0
  };
}

export function GeneratedWorkoutDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [plan, setPlan] = useState<GeneratedWorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [inputs, setInputs] = useState<ExerciseInput[]>([]);

  async function loadPlan() {
    if (!user) return;
    setIsLoading(true);
    try {
      const nextPlan = await getGeneratedWorkoutPlan(user.id);
      setPlan(nextPlan);
    } catch (error) {
      setPlan(null);
      toast({ title: "Could not load your workout plan", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const activeSession = useMemo(() => chooseActiveSession(plan?.sessions ?? []), [plan?.sessions]);
  const activeTimerKey = useMemo(
    () => workoutStorageKey(["generated-workout-session", user?.id ?? "mock-user", activeSession?.id ?? "none"]),
    [activeSession?.id, user?.id]
  );
  const stats = useMemo(() => buildStats(plan?.sessions ?? []), [plan?.sessions]);
  const activeDayTitle = activeSession?.day_title ?? "Workout day";
  const visibleSessions = useMemo(() => (plan?.sessions ?? []).slice(0, 56), [plan?.sessions]);

  useEffect(() => {
    if (!plan) {
      setInputs([]);
      return;
    }
    setInputs(hydrateInputs(plan, activeSession));
    setSessionNotes(activeSession?.notes ?? "");
  }, [activeSession, plan]);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return;
    }
    const parsedStartedAt = activeSession.started_at ? Date.parse(activeSession.started_at) : null;
    const storedStartedAt = readStoredTimestamp(activeTimerKey);
    const nextStartedAt = storedStartedAt ?? (parsedStartedAt && Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now());
    setStartedAt(nextStartedAt);
    storeTimestamp(activeTimerKey, nextStartedAt);
  }, [activeSession, activeTimerKey]);

  useEffect(() => {
    if (!activeSession) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeSession, startedAt]);

  function updateInput(index: number, patch: Partial<ExerciseInput>) {
    setInputs((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function completeWorkout() {
    if (!user || !activeSession) return;
    if (isSaving) return;
    const logRows: GeneratedExerciseLogInput[] = inputs.map((input) => {
      const hasData = input.completed || input.weightKg.trim() || input.reps.trim() || input.notes.trim();
      return {
        workoutTemplateExerciseId: input.workoutTemplateExerciseId,
        planExerciseId: input.planExerciseId,
        exerciseOrder: input.exerciseOrder,
        exerciseName: input.exerciseName,
        plannedSets: input.plannedSets,
        plannedReps: input.plannedReps,
        weightKg: toNumberOrNull(input.weightKg),
        reps: toNumberOrNull(input.reps),
        notes: input.notes || null,
        completed: Boolean(hasData)
      };
    });

    try {
      setIsSaving(true);
      await completeGeneratedWorkoutSession({
        userId: user.id,
        sessionId: activeSession.id,
        logs: logRows,
        notes: sessionNotes,
        durationMinutes: Math.max(1, Math.ceil((Date.now() - startedAt) / 60000)),
        startedAt: new Date(startedAt).toISOString()
      });
      clearStoredValue(activeTimerKey);
      toast({ title: "Workout saved", description: `${activeDayTitle} was added to your history.` });
      await loadPlan();
    } catch (error) {
      toast({ title: "Could not save workout", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  async function skipWorkout() {
    if (!user || !activeSession) return;
    if (isSkipping) return;
    try {
      setIsSkipping(true);
      await skipGeneratedWorkoutSession(user.id, activeSession.id, sessionNotes);
      clearStoredValue(activeTimerKey);
      toast({ title: "Workout skipped", description: "Your next workout day is ready." });
      await loadPlan();
    } catch (error) {
      toast({ title: "Could not skip workout", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSkipping(false);
    }
  }

  function resetWorkoutTimer() {
    const nextStartedAt = Date.now();
    setStartedAt(nextStartedAt);
    setElapsedSeconds(0);
    storeTimestamp(activeTimerKey, nextStartedAt);
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your workout plan...
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="rounded-md bg-slate-50 p-4">
            <p className="font-semibold text-slate-950">No generated workout plan yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Complete onboarding to get a recommended plan from the workout library.</p>
          </div>
          <Button asChild>
            <Link href="/onboarding">
              <Sparkles className="h-4 w-4" />
              Create my plan
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const completedExercises = inputs.filter((input) => input.completed).length;

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generated plan result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-2xl font-bold text-slate-950">{plan.template?.title ?? plan.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{plan.match_explanation || "Selected from your onboarding answers."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{plan.match_score ?? 0}% match</Badge>
              <Badge variant="outline">{plan.template?.main_goal ?? "Goal"}</Badge>
              <Badge variant="outline">{plan.template?.training_level ?? "Level"}</Badge>
              <Badge variant="outline">{plan.program_duration_weeks ?? plan.template?.program_duration_weeks ?? 0} weeks</Badge>
              <Badge variant="outline">{plan.days_per_week ?? plan.template?.days_per_week ?? 0} days/week</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {(plan.template?.equipment_required ?? []).map((item) => (
                <span key={item} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{item}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Progress overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={stats.completionPercent} />
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Completed" value={stats.completed} tone="green" />
              <MiniStat label="Skipped" value={stats.skipped} tone="amber" />
              <MiniStat label="This week" value={`${stats.completedThisWeek}/${stats.completedThisWeek + stats.skippedThisWeek}`} tone="blue" />
              <MiniStat label="This month" value={`${stats.monthlyPercent}%`} tone="slate" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-primary" />
                {activeSession?.scheduled_date === todayKey() ? "Today's workout" : "Next workout"}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeSession ? `${activeDayTitle} · ${displayDate(activeSession.scheduled_date)} · week ${activeSession.week_index}` : "All scheduled workouts are finished."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeSession ? (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTime(elapsedSeconds)}
                </Badge>
              ) : null}
              {activeSession ? (
                <Button variant="outline" onClick={resetWorkoutTimer}>
                  <TimerReset className="h-4 w-4" />
                  Reset timer
                </Button>
              ) : null}
              <Button variant="outline" onClick={skipWorkout} disabled={!activeSession || isSkipping}>
                <SkipForward className="h-4 w-4" />
                {isSkipping ? "Skipping..." : "Skip"}
              </Button>
              <Button onClick={completeWorkout} disabled={!activeSession || isSaving || !inputs.length}>
                <ClipboardCheck className="h-4 w-4" />
                {isSaving ? "Saving..." : "Complete workout"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!activeSession ? (
              <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">Every generated workout day in this plan is complete.</div>
            ) : null}
            {activeSession && !inputs.length ? (
              <div className="rounded-md bg-slate-50 p-4 text-sm text-muted-foreground">This workout day has no exercises.</div>
            ) : null}
            {inputs.map((input, index) => (
              <motion.div
                key={`${activeSession?.id}-${input.exerciseOrder}-${input.exerciseName}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, delay: index * 0.02 }}
                className={cn("rounded-md border p-3 transition", input.completed ? "border-emerald-300 bg-emerald-50" : "bg-white hover:border-primary")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{index + 1}. {input.exerciseName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {input.plannedSets || "Custom"} sets · {input.plannedReps || "Custom reps"}
                    </p>
                  </div>
                  <Button
                    variant={input.completed ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateInput(index, { completed: !input.completed })}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {input.completed ? "Done" : "Mark done"}
                  </Button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[0.7fr_0.7fr_1fr]">
                  <div className="space-y-1">
                    <Label>Actual weight</Label>
                    <Input value={input.weightKg} onChange={(event) => updateInput(index, { weightKg: event.target.value })} inputMode="decimal" placeholder="kg" />
                  </div>
                  <div className="space-y-1">
                    <Label>Actual reps</Label>
                    <Input value={input.reps} onChange={(event) => updateInput(index, { reps: event.target.value })} inputMode="numeric" placeholder="reps" />
                  </div>
                  <div className="space-y-1">
                    <Label>Notes</Label>
                    <Input value={input.notes} onChange={(event) => updateInput(index, { notes: event.target.value })} placeholder="Optional" />
                  </div>
                </div>
              </motion.div>
            ))}
            {activeSession ? (
              <div className="space-y-2">
                <Label>Workout notes</Label>
                <textarea
                  value={sessionNotes}
                  onChange={(event) => setSessionNotes(event.target.value)}
                  placeholder="How did this workout feel?"
                  className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">{completedExercises}/{inputs.length} exercises marked done</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Workout calendar
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Green days are completed. Amber days were skipped.</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadPlan}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid max-h-[34rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {visibleSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => session.plan_day_id && router.push(`/my-workout/day/${session.plan_day_id}`)}
                  className={cn(
                    "rounded-md border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
                    statusClass(session.status),
                    session.id === activeSession?.id ? "ring-2 ring-blue-200" : ""
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{displayDate(session.scheduled_date)}</p>
                      <p className="mt-1 text-xs opacity-80">Week {session.week_index} · Day {session.day_index}</p>
                    </div>
                    <Badge variant={session.status === "completed" ? "success" : "outline"} className="capitalize">
                      {session.status}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm">{session.day_title}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone: "green" | "amber" | "blue" | "slate" }) {
  const classes = {
    green: "bg-emerald-50 text-emerald-900",
    amber: "bg-amber-50 text-amber-900",
    blue: "bg-blue-50 text-blue-900",
    slate: "bg-slate-100 text-slate-900"
  };
  return (
    <div className={cn("rounded-md p-3", classes[tone])}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
