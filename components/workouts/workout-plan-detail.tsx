"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArrowLeft, Check, Copy, Dumbbell, Pencil, Play, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WorkoutAiActionPanel } from "@/components/ai/workout-ai-action-panel";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeading } from "@/components/layout/page-heading";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { todayIso } from "@/lib/date-utils";
import { resolveTodayWorkout, todayWorkoutActionHref } from "@/lib/dashboard/today-model";
import { userSafeError } from "@/lib/error-formatting";
import {
  archiveWorkoutPlan,
  deleteWorkoutPlan,
  duplicateWorkoutPlan,
  getWorkoutPlanById,
  workoutsFromLoadedPlanDay
} from "@/services/database/workout-plan-loader";
import { setDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getOpenWorkoutSessionWithStatus, getWorkoutActivity } from "@/services/database/workout-sessions";
import type { UserWorkoutPlan, WorkoutSession } from "@/types";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function WorkoutPlanDetail() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const [plan, setPlan] = useState<UserWorkoutPlan | null>(null);
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [openSession, setOpenSession] = useState<WorkoutSession | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const nextPlan = await getWorkoutPlanById(user.id, params.planId);
        if (!current) return;
        setPlan(nextPlan);
        const today = weekdays[new Date().getDay()];
        setSelectedDayId(nextPlan?.days.find((day) => day.weekday === today)?.id ?? nextPlan?.days[0]?.id ?? null);
      } catch (loadError) {
        if (current) setError(userSafeError(loadError, "This plan could not load. Your saved data was not changed."));
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, [params.planId, user]);

  useEffect(() => {
    let current = true;
    async function loadStatus() {
      if (!user?.id) return;
      setStatusLoading(true);
      setStatusUnavailable(false);
      const [historyResult, openResult] = await Promise.allSettled([
        getWorkoutActivity(user.id, 180, { throwOnError: true }),
        getOpenWorkoutSessionWithStatus(user.id)
      ]);
      if (!current) return;
      if (historyResult.status === "fulfilled") setActivity(historyResult.value);
      if (openResult.status === "fulfilled") setOpenSession(openResult.value.session);
      if (historyResult.status === "rejected" || openResult.status === "rejected" || (openResult.status === "fulfilled" && openResult.value.error)) setStatusUnavailable(true);
      setStatusLoading(false);
    }
    void loadStatus();
    return () => { current = false; };
  }, [user]);

  const selectedDay = useMemo(() => plan?.days.find((day) => day.id === selectedDayId) ?? plan?.days[0] ?? null, [plan, selectedDayId]);
  const exercises = useMemo(() => selectedDay ? workoutsFromLoadedPlanDay(selectedDay) : [], [selectedDay]);
  const selectedIsToday = selectedDay?.weekday === weekdays[new Date().getDay()];
  const resolution = useMemo(() => resolveTodayWorkout({
    today: todayIso(),
    planDayId: selectedIsToday ? selectedDay?.id ?? null : null,
    openSessionId: selectedIsToday && openSession?.plan_day_id === selectedDay?.id ? openSession.id : null,
    sessions: activity
  }), [activity, openSession, selectedDay, selectedIsToday]);
  const actionHref = selectedIsToday ? todayWorkoutActionHref(resolution, selectedDay?.id ?? null) : null;
  const actionLabel = resolution.state === "completed" ? "View completed" : resolution.state === "active" ? "Resume workout" : "Start workout";

  async function runAction(action: () => Promise<unknown>, success: string, redirect = false) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      if (redirect) router.push("/my-workout/plans");
      else router.refresh();
    } catch (actionError) {
      toast({ title: "Plan was not changed", description: userSafeError(actionError), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="space-y-4" aria-busy="true"><div className="h-9 w-56 animate-pulse rounded-lg bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>;
  }

  if (error) return <ErrorState title="Plan unavailable" description={error} onRetry={() => window.location.reload()} />;

  if (!plan) {
    return (
      <Card><CardContent className="space-y-4 p-6">
        <p className="font-semibold">This workout plan could not be found.</p>
        <Button asChild variant="outline"><Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to Train</Link></Button>
      </CardContent></Card>
    );
  }

  const exerciseCount = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);

  return (
    <div className="space-y-6">
      <PageHeading
        title={plan.name}
        description={plan.description || "Review the plan structure, then edit it or train today's scheduled day."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href={`/my-workout/plans/${plan.id}/edit`}><Pencil className="h-4 w-4" /> Edit plan</Link></Button>
            <ActionMenu label="More plan actions" disabled={busy}>
              {!plan.is_active ? <ActionMenuItem onSelect={() => void runAction(() => setDefaultUserWorkoutPlan(user!.id, plan.id), "Active plan updated")}><Star className="me-2 inline h-4 w-4" /> Make active</ActionMenuItem> : null}
              <ActionMenuItem onSelect={() => void runAction(() => duplicateWorkoutPlan(user!.id, plan.id), "Plan duplicated")}><Copy className="me-2 inline h-4 w-4" /> Duplicate</ActionMenuItem>
              <ActionMenuItem onSelect={() => ask({ title: "Archive this plan?", description: "History stays available and the plan leaves your active list.", confirmLabel: "Archive", onConfirm: () => void runAction(() => archiveWorkoutPlan(user!.id, plan.id), "Plan archived", true) })}><Archive className="me-2 inline h-4 w-4" /> Archive</ActionMenuItem>
              <ActionMenuItem destructive onSelect={() => ask({ title: "Delete this plan?", description: "Plans with workout history cannot be deleted; archive them instead.", confirmLabel: "Delete", variant: "destructive", onConfirm: () => void runAction(() => deleteWorkoutPlan(user!.id, plan.id), "Plan deleted", true) })}><Trash2 className="me-2 inline h-4 w-4" /> Delete</ActionMenuItem>
            </ActionMenu>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {plan.is_active ? <Badge><Star className="me-1 h-3.5 w-3.5" /> Active</Badge> : null}
        <Badge variant="outline">{plan.days.length} days</Badge>
        <Badge variant="outline">{exerciseCount} exercises</Badge>
        {plan.program_duration_weeks ? <Badge variant="outline">{plan.program_duration_weeks} weeks</Badge> : null}
        {plan.goal ? <Badge variant="outline">{plan.goal}</Badge> : null}
      </div>

      <section aria-labelledby="plan-week-heading" className="space-y-3">
        <div><h2 id="plan-week-heading" className="text-xl font-semibold">Plan week</h2><p className="text-sm text-muted-foreground">Choose a day to review. Training is only offered for today's scheduled workout.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {plan.days.map((day) => {
            const active = day.id === selectedDay?.id;
            return <button key={day.id} type="button" onClick={() => setSelectedDayId(day.id)} aria-pressed={active} className={`min-h-20 rounded-2xl border p-3 text-start transition ${active ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "bg-card hover:border-primary/40"}`}><span className="block text-xs text-muted-foreground">{day.weekday || "Unscheduled"}</span><span className="mt-1 block font-semibold">{day.day_name}</span><span className="mt-1 block text-xs text-muted-foreground">{day.exercises.length} exercises</span></button>;
          })}
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 border-b bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm text-muted-foreground">{selectedDay?.weekday || "Unscheduled day"}</p><h2 className="text-2xl font-semibold">{selectedDay?.day_name || "No workout day"}</h2>{plan.session_duration_minutes ? <p className="mt-1 text-sm text-muted-foreground">About {plan.session_duration_minutes} minutes</p> : null}{selectedDay?.notes ? <p className="mt-1 text-sm text-muted-foreground">{selectedDay.notes}</p> : null}</div>
            {selectedIsToday && statusLoading ? <Badge variant="outline">Checking status…</Badge> : selectedIsToday && statusUnavailable ? <Badge variant="outline">Status unavailable</Badge> : selectedIsToday && resolution.state === "skipped" ? <Badge variant="outline">Skipped today</Badge> : selectedIsToday && actionHref && exercises.length ? <Button asChild size="lg"><Link href={actionHref}>{resolution.state === "completed" ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}{actionLabel}</Link></Button> : <Badge variant="outline">Review only</Badge>}
          </div>
          <ol className="divide-y">
            {exercises.map((exercise, index) => <li key={exercise.id || `${exercise.name}-${index}`} className="flex min-h-20 items-center gap-4 p-4 sm:p-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{exercise.name}</p><p className="text-sm text-muted-foreground">{exercise.target_muscle || "General"} · {exercise.equipment || "No equipment"}</p></div><div className="text-end text-sm"><p className="font-medium">{exercise.sets ?? 3} sets · {exercise.reps || "8–12"} reps</p>{exercise.rest_seconds !== null && exercise.rest_seconds !== undefined ? <p className="text-muted-foreground">{exercise.rest_seconds}s rest</p> : null}</div></li>)}
            {!exercises.length ? <li className="grid min-h-40 place-items-center p-6 text-center"><div><Dumbbell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">No exercises in this day</p><p className="text-sm text-muted-foreground">Edit the plan to add exercises.</p></div></li> : null}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <div><p className="font-semibold">Want to change the plan?</p><p className="text-sm text-muted-foreground">Ask ChatGPT with only this plan and selected day as context.</p></div>
        <WorkoutAiActionPanel compact sourceType="workout_plan" sourceId={plan.id} context={{ workout_plan: plan, selected_day: selectedDay }} actions={[{ type: "rebalance_week", label: "Adjust plan", description: "Ask ChatGPT to adjust this plan using your saved Plaivra context." }]} />
      </div>
      <Button asChild variant="ghost"><Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to Train</Link></Button>
      {dialog}
    </div>
  );
}
