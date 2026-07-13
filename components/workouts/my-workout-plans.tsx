"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Dumbbell,
  ExternalLink,
  History,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCcw,
  Star,
  Trash2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeading } from "@/components/layout/page-heading";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { CardGridSkeleton, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { localDateToIso, todayIso } from "@/lib/date-utils";
import { resolveTodayWorkout, todayWorkoutActionHref, workoutSessionLocalDate } from "@/lib/dashboard/today-model";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { setDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import {
  archiveWorkoutPlan,
  deleteWorkoutPlan,
  duplicateWorkoutPlan,
  getAllUserWorkoutPlans,
  workoutsFromLoadedPlanDay
} from "@/services/database/workout-plan-loader";
import { getOpenWorkoutSessionWithStatus, getWorkoutActivity } from "@/services/database/workout-sessions";
import type { UserWorkoutPlan, WorkoutSession } from "@/types";

type PlanMeta = UserWorkoutPlan & {
  chatgpt_source?: boolean;
  duration_weeks?: number | null;
  session_duration_minutes?: number | null;
};

type CalendarDay = ReturnType<typeof calendarDaysFromPlan>[number];
type LoadState = "idle" | "loading" | "loaded" | "failed";

const englishWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

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

function planExerciseCount(plan: UserWorkoutPlan) {
  return plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
}

function sourceLabel(plan: UserWorkoutPlan) {
  const meta = plan as PlanMeta;
  if (plan.source === "chatgpt" || plan.source === "imported" || meta.chatgpt_source) return "ChatGPT";
  return "Manual";
}

function planDurationLabel(plan: UserWorkoutPlan) {
  const meta = plan as PlanMeta;
  const weeks = meta.program_duration_weeks ?? meta.duration_weeks;
  return weeks ? `${weeks} weeks` : null;
}

function nextScheduledDay(days: CalendarDay[], today: typeof englishWeekdays[number]) {
  const todayIndex = englishWeekdays.indexOf(today);
  return [...days]
    .filter((day) => day.weekday && day.exercises.length)
    .sort((left, right) => ((englishWeekdays.indexOf(left.weekday!) - todayIndex + 7) % 7 || 7) - ((englishWeekdays.indexOf(right.weekday!) - todayIndex + 7) % 7 || 7))[0] ?? null;
}

function buildCurrentWeek(weekStartsOn: "monday" | "sunday", now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStartIndex = weekStartsOn === "monday" ? 1 : 0;
  const offset = (start.getDay() - weekStartIndex + 7) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      iso: localDateToIso(date),
      weekday: englishWeekdays[date.getDay()]
    };
  });
}

export function MyWorkoutPlans() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings } = useUserSettings();
  const { dialog, ask } = useConfirm();
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [plansState, setPlansState] = useState<LoadState>("loading");
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansErrorDetails, setPlansErrorDetails] = useState<string | undefined>();
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [activityState, setActivityState] = useState<LoadState>("idle");
  const [activityError, setActivityError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<WorkoutSession | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const availablePlans = useMemo(() => plans.filter((plan) => !plan.archived_at), [plans]);
  const archivedPlans = useMemo(() => plans.filter((plan) => Boolean(plan.archived_at)), [plans]);
  const activePlan = useMemo(
    () => availablePlans.find((plan) => plan.is_active) ?? availablePlans.find((plan) => plan.is_default) ?? null,
    [availablePlans]
  );
  const otherPlans = useMemo(() => availablePlans.filter((plan) => plan.id !== activePlan?.id), [activePlan?.id, availablePlans]);
  const activeDays = useMemo(() => (activePlan ? calendarDaysFromPlan(activePlan) : []), [activePlan]);
  const todayWeekday = useMemo(() => englishWeekdays[new Date().getDay()], []);
  const todayDay = useMemo(
    () => activeDays.find((day) => day.weekday === todayWeekday && day.exercises.length > 0) ?? null,
    [activeDays, todayWeekday]
  );
  const nextDay = useMemo(() => nextScheduledDay(activeDays, todayWeekday), [activeDays, todayWeekday]);

  const loadPlans = useCallback(async () => {
    if (!user?.id) {
      setPlans([]);
      setPlansState("loaded");
      return;
    }
    setPlansState("loading");
    setPlansError(null);
    setPlansErrorDetails(undefined);
    try {
      setPlans(await getAllUserWorkoutPlans(user.id));
      setPlansState("loaded");
    } catch (error) {
      logRecoverableError("train-overview.plans", error);
      setPlansError(userSafeError(error, "Your workout plans could not load. Your saved data was not changed."));
      setPlansErrorDetails(technicalErrorDetails(error));
      setPlansState("failed");
    }
  }, [user]);

  const loadTodayStatus = useCallback(async () => {
    if (!user?.id) {
      setActivity([]);
      setOpenSession(null);
      setActivityState("loaded");
      setActivityError(null);
      return;
    }
    setActivityState("loading");
    setActivityError(null);
    const [historyResult, openResult] = await Promise.allSettled([
      getWorkoutActivity(user.id, 180, { throwOnError: true }),
      getOpenWorkoutSessionWithStatus(user.id)
    ]);
    let failed = false;
    if (historyResult.status === "fulfilled") setActivity(historyResult.value);
    else {
      failed = true;
      logRecoverableError("train-overview.activity", historyResult.reason);
    }
    if (openResult.status === "fulfilled") {
      setOpenSession(openResult.value.session);
      if (openResult.value.error) failed = true;
    } else {
      failed = true;
      logRecoverableError("train-overview.open-session", openResult.reason);
    }
    setActivityError(failed ? "Workout status is temporarily unavailable. No session was started or changed." : null);
    setActivityState(failed ? "failed" : "loaded");
  }, [user]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    void loadTodayStatus();
  }, [loadTodayStatus]);

  const displayedTodayDay = todayDay ?? activeDays.find((day) => day.id === openSession?.plan_day_id) ?? null;
  const resolvedPlanDayId = displayedTodayDay?.id ?? openSession?.plan_day_id ?? null;
  const todayResolution = useMemo(() => resolveTodayWorkout({
    today: todayIso(),
    planDayId: resolvedPlanDayId,
    openSessionId: openSession?.id ?? null,
    sessions: activity
  }), [activity, openSession?.id, resolvedPlanDayId]);
  const todayActionHref = todayWorkoutActionHref(todayResolution, resolvedPlanDayId);

  async function setActive(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await setDefaultUserWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Active plan updated", description: `${plan.name} now controls your training schedule.` });
    } catch (error) {
      toast({ title: "Could not activate plan", description: userSafeError(error, "Your active plan was not changed."), variant: "error" });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function duplicatePlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await duplicateWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Plan duplicated", description: `${plan.name} copy is ready to edit.` });
    } catch (error) {
      toast({ title: "Could not duplicate plan", description: userSafeError(error, "Nothing was copied."), variant: "error" });
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
      toast({ title: "Plan archived", description: "Workout history and stable exercise identities were kept." });
    } catch (error) {
      toast({ title: "Could not archive plan", description: userSafeError(error, "The plan remains available."), variant: "error" });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function deletePlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await deleteWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Plan deleted", description: `${plan.name} was permanently removed.` });
    } catch (error) {
      toast({ title: "Plan could not be deleted", description: userSafeError(error, "Plans with workout history must be archived instead."), variant: "error" });
    } finally {
      setBusyPlanId(null);
    }
  }

  function askToDelete(plan: UserWorkoutPlan) {
    ask({
      title: "Delete this plan?",
      description: "Permanent deletion is allowed only when the plan has no workout history or scheduled sessions. Archive keeps history and is usually safer.",
      confirmLabel: "Delete permanently",
      variant: "destructive",
      onConfirm: () => deletePlan(plan)
    });
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="My Workout"
        description="See what is next, follow your week, and keep your training plans organized."
        action={plansState === "loaded" && !availablePlans.length ? undefined : (
          <>
            <Button asChild variant="outline" className="min-h-12">
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                <Bot className="h-4 w-4" /> Ask ChatGPT <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <ActionMenu label="Create plan" icon={<Plus className="h-4 w-4" />} triggerVariant="default" triggerClassName="min-h-12">
              <ActionMenuItem onSelect={() => window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer")}>Create with ChatGPT</ActionMenuItem>
              <ActionMenuItem onSelect={() => router.push("/my-workout/plans/builder")}>Create manually</ActionMenuItem>
            </ActionMenu>
          </>
        )}
      />

      {plansState === "loading" ? <CardGridSkeleton count={3} rows={3} /> : null}
      {plansState === "failed" ? (
        <ErrorState
          title="Workout plans could not load"
          description={plansError ?? "Try again."}
          onRetry={loadPlans}
          details={plansErrorDetails}
        />
      ) : null}

      {plansState === "loaded" && !availablePlans.length ? (
          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="text-xl font-semibold">Create your first training plan</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Once saved, your plan appears here with direct editing, workout execution, history, and corrections.</p>
              </div>
              <div className="flex flex-wrap gap-2"><Button asChild className="min-h-12"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><Bot className="h-4 w-4" /> Create with ChatGPT <ExternalLink className="h-3.5 w-3.5" /></a></Button><Button variant="outline" className="min-h-12" onClick={() => router.push("/my-workout/plans/builder")}><Plus className="h-4 w-4" /> Create manually</Button></div>
            </CardContent>
          </Card>
      ) : null}

      {plansState === "loaded" && availablePlans.length > 0 && !activePlan ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Choose an active plan</p>
              <h2 className="mt-2 text-xl font-semibold">Your plans are safe, but none controls Today</h2>
              <p className="mt-2 text-sm text-muted-foreground">Activate one plan to restore your weekly schedule.</p>
            </div>
            <Button className="min-h-12" onClick={() => void setActive(availablePlans[0])} disabled={Boolean(busyPlanId)}><Star className="h-4 w-4" /> Activate {availablePlans[0].name}</Button>
          </CardContent>
        </Card>
      ) : null}

      {plansState === "loaded" && activePlan ? (
        <>
          <TodayCard
            plan={activePlan}
            day={displayedTodayDay}
            nextDay={nextDay}
            resolution={todayResolution}
            actionHref={todayActionHref}
            statusState={activityState}
            statusError={activityError}
            onRetryStatus={loadTodayStatus}
          />

          <ThisWeek
            days={activeDays}
            sessions={activity}
            weekStartsOn={settings.weekStartsOn}
            todayResolution={todayResolution}
          />

          <section aria-labelledby="active-plan-heading" className="space-y-3">
            <SectionHeading id="active-plan-heading" title="Active plan" description="This plan controls Today and your weekly schedule." />
            <ActivePlanRow
              plan={activePlan}
              busy={busyPlanId === activePlan.id}
              onDuplicate={() => void duplicatePlan(activePlan)}
              onArchive={() => void archivePlan(activePlan)}
              onDelete={() => askToDelete(activePlan)}
            />
          </section>
        </>
      ) : null}

      {plansState === "loaded" && otherPlans.length ? (
        <section aria-labelledby="other-plans-heading" className="space-y-3">
          <SectionHeading id="other-plans-heading" title="Other plans" description="Keep alternatives compact until you need them." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {otherPlans.map((plan) => (
              <CompactPlanRow
                key={plan.id}
                plan={plan}
                busy={busyPlanId === plan.id}
                onActivate={() => void setActive(plan)}
                onDuplicate={() => void duplicatePlan(plan)}
                onArchive={() => void archivePlan(plan)}
                onDelete={() => askToDelete(plan)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {plansState === "loaded" && archivedPlans.length ? (
        <Disclosure title="Archived plans" description={`${archivedPlans.length} kept out of your active schedule`}>
          <div className="grid gap-2">
            {archivedPlans.map((plan) => (
              <div key={plan.id} className="solid-row flex min-h-14 items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">Archived {plan.archived_at ? new Date(plan.archived_at).toLocaleDateString() : ""}</p>
                </div>
                <Button asChild variant="ghost" className="min-h-11"><Link href={`/my-workout/plans/${plan.id}`}>View</Link></Button>
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      {plansState === "loaded" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <DestinationCard href="/workouts" icon={BookOpen} title="Exercise library" description="Browse exercises, guides, equipment, and movement details." />
          <DestinationCard href="/workout-history" icon={History} title="Workout history" description="Review completed sessions, sets, notes, and past performance." />
        </div>
      ) : null}

      {dialog}
    </div>
  );
}

function TodayCard({
  plan,
  day,
  nextDay,
  resolution,
  actionHref,
  statusState,
  statusError,
  onRetryStatus
}: {
  plan: UserWorkoutPlan;
  day: CalendarDay | null;
  nextDay: CalendarDay | null;
  resolution: ReturnType<typeof resolveTodayWorkout>;
  actionHref: string | null;
  statusState: LoadState;
  statusError: string | null;
  onRetryStatus: () => Promise<void>;
}) {
  const preview = day?.exercises.slice(0, 3) ?? [];
  const remaining = Math.max(0, (day?.exercises.length ?? 0) - preview.length);
  const duration = (plan as PlanMeta).session_duration_minutes;
  const actionLabel = resolution.state === "active" ? "Resume workout" : resolution.state === "completed" ? "View completed" : resolution.state === "skipped" ? "Skipped today" : "Start workout";

  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/[0.045]">
      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Today</p>
              <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
              {resolution.state === "active" ? <Badge>In progress</Badge> : resolution.state === "completed" ? <Badge variant="secondary">Completed</Badge> : resolution.state === "skipped" ? <Badge variant="outline">Skipped</Badge> : null}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{day?.dayName ?? "Rest day"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{day ? plan.name : nextDay ? `Next: ${nextDay.dayName} · ${nextDay.weekday}` : `${plan.name} has no upcoming scheduled workout.`}</p>
            {day ? (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Dumbbell className="h-4 w-4" /> {day.exercises.length} exercises</span>
                {duration ? <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> About {duration} min</span> : null}
              </div>
            ) : null}
          </div>

          <div className="flex min-w-[190px] flex-col gap-2">
            {statusState === "loading" ? <Button disabled className="min-h-12">Checking status…</Button> : null}
            {statusState !== "loading" && statusError ? (
              <Button variant="outline" className="min-h-12" onClick={() => void onRetryStatus()}><RefreshCcw className="h-4 w-4" /> Retry status</Button>
            ) : null}
            {statusState !== "loading" && !statusError && actionHref ? (
              <Button asChild className="min-h-12"><Link href={actionHref}>{resolution.state === "completed" ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}{actionLabel}</Link></Button>
            ) : null}
            {!day ? <Button asChild variant="outline" className="min-h-12"><Link href={`/my-workout/plans/${plan.id}`}>View weekly plan</Link></Button> : null}
          </div>
        </div>

        {statusError ? <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">{statusError}</p> : null}

        {day && preview.length ? (
          <div className="mt-5 grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-3">
            {preview.map((exercise, index) => (
              <div key={exercise.plan_exercise_id ?? exercise.id} className="rounded-xl bg-background/70 p-3">
                <p className="truncate text-sm font-semibold">{index + 1}. {exercise.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{exercise.sets ?? 3} × {exercise.reps ?? "8–12"}</p>
              </div>
            ))}
            {remaining ? <p className="self-center text-sm font-medium text-muted-foreground">+ {remaining} more</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ThisWeek({
  days,
  sessions,
  weekStartsOn,
  todayResolution
}: {
  days: CalendarDay[];
  sessions: WorkoutSession[];
  weekStartsOn: "monday" | "sunday";
  todayResolution: ReturnType<typeof resolveTodayWorkout>;
}) {
  const week = useMemo(() => buildCurrentWeek(weekStartsOn), [weekStartsOn]);
  const today = todayIso();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const selectedDay = days.find((day) => day.id === selectedDayId) ?? null;

  return (
    <section aria-labelledby="this-week-heading" className="space-y-3">
      <SectionHeading id="this-week-heading" title="This week" description="Your schedule at a glance. Start or resume only from Today above." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {week.map(({ date, iso, weekday }) => {
          const planDay = days.find((day) => day.weekday === weekday) ?? null;
          const session = planDay ? sessions.find((item) => item.plan_day_id === planDay.id && workoutSessionLocalDate(item) === iso) : null;
          const isToday = iso === today;
          const status = isToday && planDay
            ? todayResolution.state
            : session?.status === "completed"
              ? "completed"
              : session?.status === "skipped"
                ? "skipped"
                : planDay
                  ? "scheduled"
                  : "rest";
          return (
            <button type="button" key={iso} onClick={() => setSelectedDayId(planDay?.id ?? null)} disabled={!planDay} aria-pressed={selectedDayId === planDay?.id} className={`min-h-32 rounded-2xl border p-3 text-start ${isToday || selectedDayId === planDay?.id ? "border-primary bg-primary/5 shadow-soft" : "border-border/70 bg-card"} disabled:cursor-default`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{date.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className="mt-0.5 text-sm font-semibold">{date.getDate()}</p>
                </div>
                {isToday ? <Badge variant="outline">Today</Badge> : null}
              </div>
              <p className="mt-4 line-clamp-2 text-sm font-medium">{planDay?.dayName ?? "Rest"}</p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">{planDay ? `${planDay.exercises.length} exercises · ${status === "active" ? "In progress" : status}` : "Rest"}</p>
            </button>
          );
        })}
      </div>
      {selectedDay ? <div className="rounded-2xl border bg-card p-4"><p className="font-semibold">{selectedDay.dayName}</p><p className="mt-1 text-sm text-muted-foreground">{selectedDay.exercises.slice(0, 4).map((exercise) => exercise.name).join(" · ")}{selectedDay.exercises.length > 4 ? ` · +${selectedDay.exercises.length - 4} more` : ""}</p></div> : null}
    </section>
  );
}

function ActivePlanRow({ plan, busy, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-semibold">{plan.name}</h3><Badge>Active</Badge><Badge variant="outline">{sourceLabel(plan)}</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">{plan.days.length} training days · {planExerciseCount(plan)} exercises{planDurationLabel(plan) ? ` · ${planDurationLabel(plan)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="min-h-11"><Link href={`/my-workout/plans/${plan.id}`}>View plan</Link></Button>
          <PlanMenu plan={plan} busy={busy} active onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
}

function CompactPlanRow({ plan, busy, onActivate, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; onActivate: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  return (
    <Card>
      <CardContent className="flex min-h-24 items-center gap-3 p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted"><CalendarDays className="h-5 w-5" /></div>
        <Link href={`/my-workout/plans/${plan.id}`} className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="truncate text-sm font-semibold">{plan.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{plan.days.length} training days{planDurationLabel(plan) ? ` · ${planDurationLabel(plan)}` : ""}</p>
        </Link>
        <PlanMenu plan={plan} busy={busy} active={false} onActivate={onActivate} onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} />
      </CardContent>
    </Card>
  );
}

function PlanMenu({ plan, busy, active, onActivate, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; active: boolean; onActivate?: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  const router = useRouter();
  return (
    <ActionMenu label={`Actions for ${plan.name}`} disabled={busy} triggerClassName="min-h-11 px-3" icon={<MoreHorizontal className="h-4 w-4" />}>
      <ActionMenuItem onSelect={() => router.push(`/my-workout/plans/${plan.id}/edit`)}>Edit plan</ActionMenuItem>
      {!active && onActivate ? <ActionMenuItem onSelect={onActivate}>Set as active</ActionMenuItem> : null}
      <ActionMenuItem onSelect={onDuplicate}>Duplicate</ActionMenuItem>
      <ActionMenuItem onSelect={onArchive}>Archive</ActionMenuItem>
      <ActionMenuItem destructive onSelect={onDelete}>Delete permanently</ActionMenuItem>
    </ActionMenu>
  );
}

function DestinationCard({ href, icon: Icon, title, description }: { href: string; icon: typeof History; title: string; description: string }) {
  return (
    <Link href={href} className="group rounded-[18px] border border-border/70 bg-card p-4 transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
      </div>
    </Link>
  );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return <div><h2 id={id} className="text-lg font-semibold tracking-[-0.02em]">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}
