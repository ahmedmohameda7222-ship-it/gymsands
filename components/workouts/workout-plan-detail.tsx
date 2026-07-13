"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import { useTrainTranslation } from "@/lib/i18n/train";
import { workoutPlanDetailActions } from "@/lib/workouts/train-overview-runtime";
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
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const { dir, locale, tr } = useTrainTranslation();
  const [plan, setPlan] = useState<UserWorkoutPlan | null>(null);
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [openSession, setOpenSession] = useState<WorkoutSession | null>(null);
  const [selectedWeekday, setSelectedWeekday] = useState<(typeof weekdays)[number]>(weekdays[new Date().getDay()]);
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
        const requestedDayId = searchParams.get("day");
        const requestedDay = requestedDayId ? nextPlan?.days.find((day) => day.id === requestedDayId) : null;
        setSelectedWeekday((requestedDay?.weekday as (typeof weekdays)[number] | null) ?? weekdays[new Date().getDay()]);
      } catch (loadError) {
        if (current) setError(userSafeError(loadError, tr("planLoadFailedDescription")));
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, [params.planId, searchParams, tr, user]);

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

  const selectedDay = useMemo(() => plan?.days.find((day) => day.weekday === selectedWeekday) ?? null, [plan, selectedWeekday]);
  const exercises = useMemo(() => selectedDay ? workoutsFromLoadedPlanDay(selectedDay) : [], [selectedDay]);
  const selectedIsToday = selectedWeekday === weekdays[new Date().getDay()];
  const resolvedPlanDayId = selectedIsToday ? openSession?.plan_day_id ?? selectedDay?.id ?? null : null;
  const resolution = useMemo(() => resolveTodayWorkout({
    today: todayIso(),
    planDayId: resolvedPlanDayId,
    openSessionId: selectedIsToday ? openSession?.id ?? null : null,
    sessions: activity
  }), [activity, openSession?.id, resolvedPlanDayId, selectedIsToday]);
  const actionHref = selectedIsToday ? todayWorkoutActionHref(resolution, resolvedPlanDayId, openSession) : null;
  const actionLabel = resolution.state === "completed" ? tr("viewCompletedWorkout") : resolution.state === "active" ? tr("resumeWorkout") : tr("startWorkout");
  const archived = Boolean(plan?.archived_at);
  const allowedActions = plan ? workoutPlanDetailActions(plan) : [];
  const nextTrainingDay = useMemo(() => {
    if (!plan) return null;
    const selectedIndex = weekdays.indexOf(selectedWeekday);
    return [...plan.days]
      .filter((day) => day.weekday && day.exercises.length)
      .sort((left, right) => ((weekdays.indexOf(left.weekday!) - selectedIndex + 7) % 7 || 7) - ((weekdays.indexOf(right.weekday!) - selectedIndex + 7) % 7 || 7))[0] ?? null;
  }, [plan, selectedWeekday]);

  async function runAction(action: () => Promise<unknown>, success: string, redirect = false) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      if (redirect) router.push("/my-workout/plans");
      else if (plan) {
        const refreshed = await getWorkoutPlanById(user!.id, plan.id);
        if (refreshed) setPlan(refreshed);
      }
    } catch (actionError) {
      toast({ title: tr("planNotChanged"), description: userSafeError(actionError), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="space-y-4" aria-busy="true"><div className="h-9 w-56 animate-pulse rounded-lg bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>;
  }

  if (error) return <ErrorState title={tr("planUnavailable")} description={error} onRetry={() => window.location.reload()} />;

  if (!plan) {
    return (
      <Card><CardContent className="space-y-4 p-6">
        <p className="font-semibold">{tr("planNotFound")}</p>
        <Button asChild variant="outline"><Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("backToTrain")}</Link></Button>
      </CardContent></Card>
    );
  }

  const exerciseCount = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);

  return (
    <div className="space-y-6" dir={dir}>
      <PageHeading
        title={plan.name}
        description={plan.description || tr("planDetailsDescription")}
        action={
          <div className="flex flex-wrap gap-2">
            {allowedActions.includes("edit") ? <Button asChild><Link href={`/my-workout/plans/${plan.id}/edit`}><Pencil className="h-4 w-4" /> {tr("editPlan")}</Link></Button> : null}
            <ActionMenu label={`${tr("moreActions")}: ${plan.name}`} disabled={busy}>
              {allowedActions.includes("activate") && !plan.is_active ? <ActionMenuItem onSelect={() => void runAction(() => setDefaultUserWorkoutPlan(user!.id, plan.id), tr("activePlanUpdated"))}><Star className="me-2 inline h-4 w-4" /> {archived ? tr("restoreActivate") : tr("setActive")}</ActionMenuItem> : null}
              {allowedActions.includes("duplicate") ? <ActionMenuItem onSelect={() => void runAction(() => duplicateWorkoutPlan(user!.id, plan.id), tr("planDuplicated"))}><Copy className="me-2 inline h-4 w-4" /> {tr("duplicate")}</ActionMenuItem> : null}
              {allowedActions.includes("archive") ? <ActionMenuItem onSelect={() => ask({ title: tr("archive"), description: tr("planArchivedDescription"), confirmLabel: tr("archive"), onConfirm: () => void runAction(() => archiveWorkoutPlan(user!.id, plan.id), tr("planArchived"), true) })}><Archive className="me-2 inline h-4 w-4" /> {tr("archive")}</ActionMenuItem> : null}
              {allowedActions.includes("delete") ? <ActionMenuItem destructive onSelect={() => ask({ title: tr("deleteTitle"), description: tr("deleteDescription"), confirmLabel: tr("deletePermanently"), variant: "destructive", onConfirm: () => void runAction(() => deleteWorkoutPlan(user!.id, plan.id), tr("planDeleted"), true) })}><Trash2 className="me-2 inline h-4 w-4" /> {tr("deletePermanently")}</ActionMenuItem> : null}
            </ActionMenu>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {plan.is_active ? <Badge><Star className="me-1 h-3.5 w-3.5" /> {tr("active")}</Badge> : null}
        {archived ? <Badge variant="outline">{tr("archived")}</Badge> : null}
        <Badge variant="outline">{tr("trainingDays", { count: plan.days.length })}</Badge>
        <Badge variant="outline">{tr("exercises", { count: exerciseCount })}</Badge>
        {plan.program_duration_weeks ? <Badge variant="outline">{tr("programWeeks", { count: plan.program_duration_weeks })}</Badge> : null}
        {plan.goal ? <Badge variant="outline">{plan.goal}</Badge> : null}
      </div>

      {archived ? <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4"><p className="font-semibold">{tr("archived")}</p><p className="mt-1 text-sm text-muted-foreground">{tr("archivedMessage")}</p></div> : null}

      <section aria-labelledby="plan-week-heading" className="space-y-3">
        <div><h2 id="plan-week-heading" className="text-xl font-semibold">{tr("planWeek")}</h2><p className="text-sm text-muted-foreground">{tr("planWeekDescription")}</p></div>
        <div className="grid grid-flow-col auto-cols-[minmax(108px,1fr)] gap-2 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible">
          {weekdays.map((weekday, index) => {
            const day = plan.days.find((item) => item.weekday === weekday) ?? null;
            const active = weekday === selectedWeekday;
            const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + index));
            return <button key={weekday} type="button" onClick={() => setSelectedWeekday(weekday)} aria-pressed={active} className={`min-h-24 rounded-2xl border p-3 text-start transition ${active ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "bg-card hover:border-primary/40"}`}><span className="block text-xs text-muted-foreground">{weekdayLabel}</span><span className="mt-1 block font-semibold">{day?.day_name ?? tr("restDay")}</span><span className="mt-1 block text-xs text-muted-foreground">{day ? tr("exercises", { count: day.exercises.length }) : tr("rest")}</span></button>;
          })}
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 border-b bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + weekdays.indexOf(selectedWeekday)))}</p><h2 className="text-2xl font-semibold">{selectedDay?.day_name || tr("restDay")}</h2>{selectedDay && plan.session_duration_minutes ? <p className="mt-1 text-sm text-muted-foreground">{tr("aboutMinutes", { count: plan.session_duration_minutes })}</p> : null}{selectedDay?.notes ? <p className="mt-1 text-sm text-muted-foreground">{selectedDay.notes}</p> : !selectedDay && nextTrainingDay ? <p className="mt-1 text-sm text-muted-foreground">{tr("nextWorkout", { workout: nextTrainingDay.day_name, weekday: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + weekdays.indexOf(nextTrainingDay.weekday!))) })}</p> : null}</div>
            {allowedActions.includes("start") && plan.is_active && selectedIsToday && statusLoading ? <Badge variant="outline">{tr("checkingStatus")}</Badge> : allowedActions.includes("start") && plan.is_active && selectedIsToday && statusUnavailable && resolution.state !== "active" ? <Badge variant="outline">{tr("statusUnavailable")}</Badge> : allowedActions.includes("start") && plan.is_active && selectedIsToday && resolution.state === "skipped" ? <Badge variant="outline">{tr("skippedToday")}</Badge> : allowedActions.includes(resolution.state === "active" ? "resume" : "start") && plan.is_active && selectedIsToday && actionHref && (exercises.length || resolution.state === "active") ? <Button asChild size="lg"><Link href={actionHref}>{resolution.state === "completed" ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}{actionLabel}</Link></Button> : <Badge variant="outline">{archived ? tr("archived") : tr("reviewOnly")}</Badge>}
          </div>
          <ol className="divide-y">
            {exercises.map((exercise, index) => <li key={exercise.id || `${exercise.name}-${index}`} className="flex min-h-20 items-center gap-4 p-4 sm:p-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{exercise.name}</p><p className="text-sm text-muted-foreground">{exercise.target_muscle || tr("general")} · {exercise.equipment || tr("noEquipment")}</p></div><div className="text-end text-sm"><p className="font-medium">{tr("setsReps", { sets: exercise.sets ?? 3, reps: exercise.reps || "8–12" })}</p>{exercise.rest_seconds !== null && exercise.rest_seconds !== undefined ? <p className="text-muted-foreground">{tr("secondsRest", { count: exercise.rest_seconds })}</p> : null}</div></li>)}
            {!exercises.length ? <li className="grid min-h-40 place-items-center p-6 text-center"><div><Dumbbell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">{tr("restDay")}</p>{selectedDay ? <p className="text-sm text-muted-foreground">{tr("noExercisesDayDescription")}</p> : nextTrainingDay ? <p className="text-sm text-muted-foreground">{tr("nextWorkout", { workout: nextTrainingDay.day_name, weekday: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + weekdays.indexOf(nextTrainingDay.weekday!))) })}</p> : null}</div></li> : null}
          </ol>
        </CardContent>
      </Card>

      {allowedActions.includes("adjust") ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <div><p className="font-semibold">{tr("adjustPlanTitle")}</p><p className="text-sm text-muted-foreground">{tr("adjustPlanDescription")}</p></div>
        <WorkoutAiActionPanel compact sourceType="workout_plan" sourceId={plan.id} context={{ workout_plan: plan, selected_day: selectedDay }} actions={[{ type: "rebalance_week", label: tr("adjustPlan"), description: tr("adjustPlanDescription") }]} />
      </div> : null}
      <Button asChild variant="ghost"><Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("backToTrain")}</Link></Button>
      {dialog}
    </div>
  );
}
