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
  History,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCcw,
  Star,
  Trash2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
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
import { useTrainTranslation } from "@/lib/i18n/train";
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

function sourceLabel(plan: UserWorkoutPlan, manual: string) {
  const meta = plan as PlanMeta;
  if (plan.source === "chatgpt" || plan.source === "imported" || meta.chatgpt_source) return "ChatGPT";
  return manual;
}

function planDurationWeeks(plan: UserWorkoutPlan) {
  const meta = plan as PlanMeta;
  return meta.program_duration_weeks ?? meta.duration_weeks ?? null;
}

function localizedWeekday(weekday: typeof englishWeekdays[number] | null | undefined, locale: string, format: "long" | "short" = "long") {
  if (!weekday) return "";
  const index = englishWeekdays.indexOf(weekday);
  return new Intl.DateTimeFormat(locale, { weekday: format }).format(new Date(2024, 0, 7 + index));
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
  const { openPrompts } = useQuickChatGpt();
  const { dir, locale, tr } = useTrainTranslation();
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
      setPlansError(userSafeError(error, tr("planLoadFailedDescription")));
      setPlansErrorDetails(technicalErrorDetails(error));
      setPlansState("failed");
    }
  }, [tr, user]);

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
    setActivityError(failed ? tr("activityUnavailable") : null);
    setActivityState(failed ? "failed" : "loaded");
  }, [tr, user]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    void loadTodayStatus();
  }, [loadTodayStatus]);

  const displayedTodayDay = todayDay;
  const resolvedPlanDayId = displayedTodayDay?.id ?? null;
  const todayResolution = useMemo(() => resolveTodayWorkout({
    today: todayIso(),
    planDayId: resolvedPlanDayId,
    openSessionId: openSession?.plan_day_id === resolvedPlanDayId ? openSession.id : null,
    sessions: activity
  }), [activity, openSession, resolvedPlanDayId]);
  const todayActionHref = todayWorkoutActionHref(todayResolution, resolvedPlanDayId);

  async function setActive(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await setDefaultUserWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: tr("activePlanUpdated"), description: tr("activePlanUpdatedDescription", { name: plan.name }) });
    } catch (error) {
      toast({ title: tr("activateFailed"), description: userSafeError(error, tr("activateFailedDescription")), variant: "error" });
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
      toast({ title: tr("planDuplicated"), description: tr("planDuplicatedDescription", { name: plan.name }) });
    } catch (error) {
      toast({ title: tr("duplicateFailed"), description: userSafeError(error, tr("duplicateFailedDescription")), variant: "error" });
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
      toast({ title: tr("planArchived"), description: tr("planArchivedDescription") });
    } catch (error) {
      toast({ title: tr("archiveFailed"), description: userSafeError(error, tr("archiveFailedDescription")), variant: "error" });
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
      toast({ title: tr("planDeleted"), description: tr("planDeletedDescription", { name: plan.name }) });
    } catch (error) {
      toast({ title: tr("deleteFailed"), description: userSafeError(error, tr("deleteFailedDescription")), variant: "error" });
    } finally {
      setBusyPlanId(null);
    }
  }

  function askToDelete(plan: UserWorkoutPlan) {
    ask({
      title: tr("deleteTitle"),
      description: tr("deleteDescription"),
      confirmLabel: tr("deletePermanently"),
      variant: "destructive",
      onConfirm: () => deletePlan(plan)
    });
  }

  return (
    <div className="space-y-6" dir={dir}>
      <PageHeading
        title={tr("myWorkout")}
        description={tr("overviewDescription")}
        action={plansState === "loaded" && !availablePlans.length ? undefined : (
          <>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => openPrompts()}>
              <Bot className="h-4 w-4" /> {tr("askChatGpt")}
            </Button>
            <ActionMenu label={tr("createPlan")} icon={<Plus className="h-4 w-4" />} triggerVariant="default" triggerClassName="min-h-12">
              <ActionMenuItem onSelect={() => openPrompts("create-workout-plan")}>{tr("createWithChatGpt")}</ActionMenuItem>
              <ActionMenuItem onSelect={() => router.push("/my-workout/plans/builder")}>{tr("createManually")}</ActionMenuItem>
            </ActionMenu>
          </>
        )}
      />

      {plansState === "loading" ? <CardGridSkeleton count={3} rows={3} /> : null}
      {plansState === "failed" ? (
        <ErrorState
          title={tr("planLoadFailed")}
          description={plansError ?? tr("tryAgain")}
          onRetry={loadPlans}
          details={plansErrorDetails}
        />
      ) : null}

      {plansState === "loaded" && !availablePlans.length ? (
          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="text-xl font-semibold">{tr("createFirstPlan")}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{tr("createFirstPlanDescription")}</p>
              </div>
              <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-12" onClick={() => openPrompts("create-workout-plan")}><Bot className="h-4 w-4" /> {tr("createWithChatGpt")}</Button><Button variant="outline" className="min-h-12" onClick={() => router.push("/my-workout/plans/builder")}><Plus className="h-4 w-4" /> {tr("createManually")}</Button></div>
            </CardContent>
          </Card>
      ) : null}

      {plansState === "loaded" && availablePlans.length > 0 && !activePlan ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">{tr("chooseActivePlan")}</p>
              <h2 className="mt-2 text-xl font-semibold">{tr("noActivePlan")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{tr("noActivePlanDescription")}</p>
            </div>
            <Button className="min-h-12" onClick={() => void setActive(availablePlans[0])} disabled={Boolean(busyPlanId)}><Star className="h-4 w-4" /> {tr("activateNamed", { name: availablePlans[0].name })}</Button>
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
            <SectionHeading id="active-plan-heading" title={tr("activePlan")} description={tr("activePlanDescription")} />
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
          <SectionHeading id="other-plans-heading" title={tr("otherPlans")} description={tr("otherPlansDescription")} />
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
        <Disclosure title={tr("archivedPlans")} description={tr("archivedPlansDescription", { count: archivedPlans.length })}>
          <div className="grid gap-2">
            {archivedPlans.map((plan) => (
              <div key={plan.id} className="solid-row flex min-h-14 items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{tr("archived")} {plan.archived_at ? new Date(plan.archived_at).toLocaleDateString(locale) : ""}</p>
                </div>
                <Button asChild variant="ghost" className="min-h-11"><Link href={`/my-workout/plans/${plan.id}`}>{tr("viewPlan")}</Link></Button>
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      {plansState === "loaded" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <DestinationCard href="/workouts" icon={BookOpen} title={tr("exerciseLibrary")} description={tr("exerciseLibraryDescription")} />
          <DestinationCard href="/workout-history" icon={History} title={tr("workoutHistory")} description={tr("workoutHistoryDescription")} />
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
  const { locale, tr } = useTrainTranslation();
  const preview = day?.exercises.slice(0, 3) ?? [];
  const remaining = Math.max(0, (day?.exercises.length ?? 0) - preview.length);
  const duration = (plan as PlanMeta).session_duration_minutes;
  const actionLabel = resolution.state === "active" ? tr("resumeWorkout") : resolution.state === "completed" ? tr("viewCompletedWorkout") : resolution.state === "skipped" ? tr("skippedToday") : tr("startWorkout");

  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/[0.045]">
      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{tr("today")}</p>
              <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}</span>
              {resolution.state === "active" ? <Badge>{tr("inProgress")}</Badge> : resolution.state === "completed" ? <Badge variant="secondary">{tr("completed")}</Badge> : resolution.state === "skipped" ? <Badge variant="outline">{tr("skippedToday")}</Badge> : null}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{day?.dayName ?? tr("todayRestDay")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{day ? plan.name : nextDay ? tr("nextWorkout", { workout: nextDay.dayName, weekday: localizedWeekday(nextDay.weekday, locale) }) : plan.name}</p>
            {day ? (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Dumbbell className="h-4 w-4" /> {tr("exercises", { count: day.exercises.length })}</span>
                {duration ? <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {tr("aboutMinutes", { count: duration })}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="flex min-w-[190px] flex-col gap-2">
            {statusState === "loading" ? <Button disabled className="min-h-12">{tr("checkingStatus")}</Button> : null}
            {statusState !== "loading" && statusError ? (
              <Button variant="outline" className="min-h-12" onClick={() => void onRetryStatus()}><RefreshCcw className="h-4 w-4" /> {tr("retryStatus")}</Button>
            ) : null}
            {statusState !== "loading" && !statusError && actionHref ? (
              <Button asChild className="min-h-12"><Link href={actionHref}>{resolution.state === "completed" ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}{actionLabel}</Link></Button>
            ) : null}
            {!day ? <Button asChild variant="outline" className="min-h-12"><Link href={`/my-workout/plans/${plan.id}`}>{tr("viewWeeklyPlan")}</Link></Button> : null}
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
            {remaining ? <p className="self-center text-sm font-medium text-muted-foreground">{tr("moreExercises", { count: remaining })}</p> : null}
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
  const { locale, tr } = useTrainTranslation();
  const week = useMemo(() => buildCurrentWeek(weekStartsOn), [weekStartsOn]);
  const today = todayIso();
  const [selectedIso, setSelectedIso] = useState(today);
  const selectedWeekDay = week.find((day) => day.iso === selectedIso) ?? week[0];
  const selectedDay = days.find((day) => day.weekday === selectedWeekDay?.weekday) ?? null;

  return (
    <section aria-labelledby="this-week-heading" className="space-y-3">
      <SectionHeading id="this-week-heading" title={tr("thisWeek")} description={tr("thisWeekDescription")} />
      <div className="grid snap-x grid-flow-col auto-cols-[minmax(88px,1fr)] gap-2 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible">
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
            <button type="button" key={iso} onClick={() => setSelectedIso(iso)} aria-pressed={selectedIso === iso} className={`min-h-24 snap-start rounded-2xl border p-2.5 text-start ${isToday || selectedIso === iso ? "border-primary bg-primary/5 shadow-soft" : "border-border/70 bg-card"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{date.toLocaleDateString(locale, { weekday: "short" })}</p>
                  <p className="mt-0.5 text-sm font-semibold">{date.getDate()}</p>
                </div>
                {isToday ? <span className="sr-only">{tr("todayLabel")}</span> : null}
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-medium">{planDay?.dayName ?? tr("rest")}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className={`h-2 w-2 rounded-full ${status === "completed" ? "bg-success" : status === "active" ? "bg-primary" : status === "skipped" ? "bg-warning" : "bg-muted-foreground/50"}`} />{status === "active" ? tr("inProgress") : status === "completed" ? tr("completed") : status === "scheduled" ? tr("scheduled") : status === "skipped" ? tr("skippedToday") : tr("rest")}</span>
            </button>
          );
        })}
      </div>
      <div className="border-s-2 border-primary/30 ps-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">{selectedWeekDay?.date.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}</p><p className="font-semibold">{selectedDay?.dayName ?? tr("restDay")}</p></div>{selectedDay ? <Button asChild variant="ghost" className="min-h-11"><Link href={`/my-workout/plans/${selectedDay.planId}?day=${encodeURIComponent(selectedDay.id)}`}>{tr("viewDay")}</Link></Button> : null}</div>
        {selectedDay ? <p className="mt-1 text-sm text-muted-foreground">{tr("exercises", { count: selectedDay.exercises.length })}{selectedDay.exercises.length ? ` · ${selectedDay.exercises.slice(0, 3).map((exercise) => exercise.name).join(" · ")}` : ""}{selectedDay.exercises.length > 3 ? ` · ${tr("moreExercises", { count: selectedDay.exercises.length - 3 })}` : ""}</p> : <p className="mt-1 text-sm text-muted-foreground">{tr("restDay")}</p>}
      </div>
    </section>
  );
}

function ActivePlanRow({ plan, busy, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  const { tr } = useTrainTranslation();
  const durationWeeks = planDurationWeeks(plan);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-semibold">{plan.name}</h3><Badge>{tr("active")}</Badge><Badge variant="outline">{sourceLabel(plan, tr("sourceManual"))}</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">{tr("trainingDays", { count: plan.days.length })} · {tr("exercises", { count: planExerciseCount(plan) })}{durationWeeks ? ` · ${tr("programWeeks", { count: durationWeeks })}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="min-h-11"><Link href={`/my-workout/plans/${plan.id}`}>{tr("viewPlan")}</Link></Button>
          <Button asChild variant="ghost" className="min-h-11"><Link href={`/my-workout/plans/${plan.id}/edit`}>{tr("editPlan")}</Link></Button>
          <PlanMenu plan={plan} busy={busy} active onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
}

function CompactPlanRow({ plan, busy, onActivate, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; onActivate: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  const { tr } = useTrainTranslation();
  const durationWeeks = planDurationWeeks(plan);
  return (
    <Card>
      <CardContent className="flex min-h-24 items-center gap-3 p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted"><CalendarDays className="h-5 w-5" /></div>
        <Link href={`/my-workout/plans/${plan.id}`} className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="truncate text-sm font-semibold">{plan.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tr("trainingDays", { count: plan.days.length })}{durationWeeks ? ` · ${tr("programWeeks", { count: durationWeeks })}` : ""}</p>
        </Link>
        <PlanMenu plan={plan} busy={busy} active={false} onActivate={onActivate} onDuplicate={onDuplicate} onArchive={onArchive} onDelete={onDelete} />
      </CardContent>
    </Card>
  );
}

function PlanMenu({ plan, busy, active, onActivate, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; active: boolean; onActivate?: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  const router = useRouter();
  const { tr } = useTrainTranslation();
  return (
    <ActionMenu label={`${tr("moreActions")}: ${plan.name}`} disabled={busy} triggerClassName="min-h-11 px-3" icon={<MoreHorizontal className="h-4 w-4" />}>
      <ActionMenuItem onSelect={() => router.push(`/my-workout/plans/${plan.id}/edit`)}>{tr("editPlan")}</ActionMenuItem>
      {!active && onActivate ? <ActionMenuItem onSelect={onActivate}>{tr("setActive")}</ActionMenuItem> : null}
      <ActionMenuItem onSelect={onDuplicate}>{tr("duplicate")}</ActionMenuItem>
      <ActionMenuItem onSelect={onArchive}>{tr("archive")}</ActionMenuItem>
      <ActionMenuItem destructive onSelect={onDelete}>{tr("deletePermanently")}</ActionMenuItem>
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
