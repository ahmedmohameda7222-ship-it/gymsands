"use client";

import Link from "next/link";
import { Archive, CalendarDays, Copy, Dumbbell, Edit3, Plus, RefreshCcw, Save, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { userSafeError, logRecoverableError, technicalErrorDetails } from "@/lib/error-formatting";
import { getWorkoutActivity, setDefaultUserWorkoutPlan } from "@/services/database/repository";
import { archiveWorkoutPlan, duplicateWorkoutPlan, getActiveWorkoutPlan, getAllUserWorkoutPlans, updateWorkoutPlanMetadata, workoutsFromLoadedPlanDay } from "@/services/database/workout-plan-loader";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";
import { WorkoutCalendar } from "@/components/workouts/workout-calendar";
import { Input } from "@/components/ui/input";
import type { UserWorkoutPlan, WorkoutSession } from "@/types";

type PlanMeta = Omit<UserWorkoutPlan, "source"> & { source?: string; chatgpt_source?: boolean };

function isChatGptPlan(plan: UserWorkoutPlan | null) {
  const meta = plan as PlanMeta | null;
  return Boolean(meta && (meta.source === "chatgpt" || meta.chatgpt_source));
}

function calendarDaysFromPlan(plan: UserWorkoutPlan) {
  return plan.days.map((day) => ({
    id: day.id,
    planId: day.plan_id,
    dayName: day.day_name,
    weekday: day.weekday,
    notes: day.notes ?? "",
    exercises: workoutsFromLoadedPlanDay(day)
  }));
}

export function MyWorkoutPlans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [activePlan, setActivePlan] = useState<UserWorkoutPlan | null>(null);
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [showBuilder, setShowBuilder] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function loadPlans() {
    if (!user?.id) {
      setPlans([]);
      setActivePlan(null);
      setActivity([]);
      setLoadError(null);
      setLoadErrorDetails(undefined);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const [nextPlans, nextActivePlan, nextActivity] = await Promise.all([
        getAllUserWorkoutPlans(user.id),
        getActiveWorkoutPlan(user.id),
        getWorkoutActivity(user.id)
      ]);
      setPlans(nextPlans);
      setActivePlan(nextActivePlan);
      setActivity(nextActivity);
      setActiveDayIndex(0);
    } catch (error) {
      logRecoverableError("workout-plans.load", error);
      const message = userSafeError(error, "Workout plans could not be loaded. Retry without losing any saved plan data.");
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: "Could not load workout plans", description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function setDefaultPlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await setDefaultUserWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Default plan updated", description: `${plan.name} is now active.` });
    } catch (error) {
      logRecoverableError("workout-plans.default", error);
      toast({ title: "Could not set default plan", description: userSafeError(error, "The default plan was not changed. Try again.") });
    } finally {
      setBusyPlanId(null);
    }
  }

  const activeCalendarDays = useMemo(() => (activePlan ? calendarDaysFromPlan(activePlan) : []), [activePlan]);
  const availablePlans = plans.filter((plan) => !plan.archived_at);
  const archivedPlans = plans.filter((plan) => plan.archived_at);

  function startToday() {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const todayIndex = activeCalendarDays.findIndex((day) => day.weekday === today && day.exercises.length > 0);
    if (todayIndex < 0) {
      toast({ title: "No workout for today", description: activePlan ? `${activePlan.name} has no workout assigned today.` : "Choose an active workout plan first." });
      return;
    }
    const day = activeCalendarDays[todayIndex];
    if (day.id) window.location.href = `/workouts/session/day/${day.id}`;
  }

  async function duplicatePlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await duplicateWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Plan duplicated", description: `${plan.name} copy was saved as inactive.` });
    } catch (error) {
      logRecoverableError("workout-plans.duplicate", error);
      toast({ title: "Could not duplicate plan", description: userSafeError(error, "The plan was not duplicated. Try again.") });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function archivePlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await archiveWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Plan archived", description: `${plan.name} is hidden from active planning. Workout history is kept.` });
    } catch (error) {
      logRecoverableError("workout-plans.archive", error);
      toast({ title: "Could not archive plan", description: userSafeError(error, "The plan was not archived. Try again.") });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function saveMetadata(plan: UserWorkoutPlan) {
    if (!user?.id) return;
    if (!editName.trim()) {
      toast({ title: "Plan name required", description: "Enter a plan name before saving." });
      return;
    }
    setBusyPlanId(plan.id);
    try {
      await updateWorkoutPlanMetadata(user.id, plan.id, { name: editName });
      setEditingPlanId(null);
      await loadPlans();
      toast({ title: "Plan updated", description: "Workout plan metadata was saved." });
    } catch (error) {
      logRecoverableError("workout-plans.metadata", error);
      toast({ title: "Could not update plan", description: userSafeError(error, "Your edited name is still on screen. Try saving again.") });
    } finally {
      setBusyPlanId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Workout Plans</h2>
          <p className="text-sm text-muted-foreground">Track ChatGPT-exported workout plans and manual plans saved to your account.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadPlans} disabled={isLoading}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => setShowBuilder((current) => !current)}>
            <Plus className="h-4 w-4" /> {showBuilder ? "Close Builder" : "Manual Plan Builder"}
          </Button>
        </div>
      </div>

      {isLoading ? <CardGridSkeleton count={3} rows={4} /> : null}

      {!isLoading && loadError ? (
        <ErrorState
          title="Workout plans could not load"
          description={loadError}
          onRetry={loadPlans}
          fallbackLabel="Open ChatGPT setup"
          fallbackHref="/settings"
          details={loadErrorDetails}
        />
      ) : null}

      {!isLoading && !loadError && activePlan ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Active plan <Badge>{activePlan.name}</Badge>
              {isChatGptPlan(activePlan) ? <Badge variant="outline">ChatGPT</Badge> : null}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Weekly calendar is loaded from the saved active plan days and exercises.</p>
          </CardHeader>
          <CardContent>
            <WorkoutCalendar days={activeCalendarDays} activity={activity} activeDayIndex={activeDayIndex} onSelectDay={setActiveDayIndex} onStartToday={startToday} />
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !loadError && !plans.length ? (
        <EmptyState
          title="No workout plans yet"
          description="Import a workout plan from ChatGPT to start scheduling and tracking real saved exercises. The app will not show fake workout data here."
          actionLabel="Set up ChatGPT import"
          actionHref="/settings"
          secondaryLabel="Create manual plan"
          secondaryHref="/my-workout/plans"
        />
      ) : null}

      {!isLoading && !loadError ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {availablePlans.map((plan) => {
            const exerciseCount = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
            const isDefault = plan.is_default ?? plan.is_active;
            const sourceLabel = sourceBadge(plan);
            const warnings = planWarnings(plan);
            return (
              <Card key={plan.id}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-3">
                    <span>{plan.name}</span>
                    {isDefault ? <Badge>Default</Badge> : <Badge variant="outline">{sourceLabel}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editingPlanId === plan.id ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Plan name" />
                      <Button onClick={() => saveMetadata(plan)} disabled={busyPlanId === plan.id}>
                        <Save className="h-4 w-4" /> Save
                      </Button>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-slate-50 p-3"><CalendarDays className="h-4 w-4 text-muted-foreground" /><p className="mt-1 text-xl font-bold text-slate-950">{plan.days.length}</p><p className="text-xs text-muted-foreground">Days</p></div>
                    <div className="rounded-md bg-slate-50 p-3"><Dumbbell className="h-4 w-4 text-muted-foreground" /><p className="mt-1 text-xl font-bold text-slate-950">{exerciseCount}</p><p className="text-xs text-muted-foreground">Exercises</p></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {plan.days.slice(0, 4).map((day) => <Badge key={day.id} variant="outline">{day.weekday ?? day.day_name}</Badge>)}
                  </div>
                  {warnings.length ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p className="font-semibold">Validation warnings</p>
                      <p className="mt-1">{warnings.join(" | ")}</p>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <Button asChild className="w-full"><Link href={`/my-workout/plans/${plan.id}`}>Open Plan</Link></Button>
                    <Button type="button" variant={isDefault ? "secondary" : "outline"} className="w-full" onClick={() => setDefaultPlan(plan)} disabled={isDefault || busyPlanId === plan.id}>
                      <Star className="h-4 w-4" /> {isDefault ? "Default Plan" : "Set as Default Plan"}
                    </Button>
                    <div className="grid grid-cols-3 gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => { setEditingPlanId(plan.id); setEditName(plan.name); }} aria-label="Edit plan name">
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => duplicatePlan(plan)} disabled={busyPlanId === plan.id} aria-label="Duplicate plan">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => archivePlan(plan)} disabled={busyPlanId === plan.id} aria-label="Archive plan">
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {!isLoading && !loadError && archivedPlans.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Archived plans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {archivedPlans.map((plan) => (
              <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-semibold">{plan.name}</p>
                  <p className="text-muted-foreground">{plan.archived_at ? new Date(plan.archived_at).toLocaleDateString() : "Archived"}</p>
                </div>
                <Button asChild variant="outline" size="sm"><Link href={`/my-workout/plans/${plan.id}`}>View</Link></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {showBuilder ? <WorkoutPlanBuilder loadActivePlan={false} onSaved={loadPlans} /> : null}
    </div>
  );
}

function sourceBadge(plan: UserWorkoutPlan) {
  if (isChatGptPlan(plan) || plan.source === "chatgpt" || plan.source === "imported") return "Imported";
  if (plan.source === "manual") return "Manual";
  return "Saved";
}

function planWarnings(plan: UserWorkoutPlan) {
  const warnings: string[] = [];
  if (!plan.days.length) warnings.push("missing days");
  if (!plan.days.some((day) => day.exercises.length)) warnings.push("missing exercises");
  if (!plan.days_per_week) warnings.push("no days/week");
  if (!plan.program_duration_weeks) warnings.push("no duration");
  const weekdays = plan.days.map((day) => day.weekday).filter(Boolean);
  if (new Set(weekdays).size !== weekdays.length) warnings.push("duplicate weekdays");
  if (plan.days.some((day) => day.exercises.some((exercise) => !exercise.sets || !exercise.reps))) warnings.push("missing sets/reps");
  return warnings;
}
