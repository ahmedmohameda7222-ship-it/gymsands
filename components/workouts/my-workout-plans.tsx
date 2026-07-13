"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { activeWorkoutEvent } from "@/lib/active-workout";
import { localDateToIso, todayIso } from "@/lib/date-utils";
import { resolveTodayWorkout, todayWorkoutActionHref, workoutSessionLocalDate } from "@/lib/dashboard/today-model";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTrainTranslation } from "@/lib/i18n/train";
import {
  buildTrainQuickPromptContext,
  clearedTrainQuickPromptContext,
  emptyTrainProfileCapabilities,
  findOpenSessionPlanContext,
  isTrainRequestCurrent,
  trainRequestKey,
  type TrainProfileCapabilities,
  type TrainRequestIdentity
} from "@/lib/workouts/train-overview-runtime";
import { resolveTrainWeekSelection, startTrainLocalDateRefresh } from "@/lib/workouts/train-local-date";
import { shouldShowRestDayPlanAction } from "@/lib/workouts/train-visual";
import { getDashboardProfileContext } from "@/services/database/dashboard-today-sources";
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
  const userId = user?.id ?? null;
  const { toast } = useToast();
  const { settings } = useUserSettings();
  const { dialog, ask } = useConfirm();
  const { openPrompts, setDashboardContext } = useQuickChatGpt();
  const { dir, locale, tr } = useTrainTranslation();
  const [today, setToday] = useState(todayIso);
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [plansState, setPlansState] = useState<LoadState>("loading");
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansErrorDetails, setPlansErrorDetails] = useState<string | undefined>();
  const [plansDataKey, setPlansDataKey] = useState("");
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [activityState, setActivityState] = useState<LoadState>("idle");
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityDataKey, setActivityDataKey] = useState("");
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [openSession, setOpenSession] = useState<WorkoutSession | null>(null);
  const [profileContext, setProfileContext] = useState<TrainProfileCapabilities>(emptyTrainProfileCapabilities);
  const [profileDataKey, setProfileDataKey] = useState("");
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const identityRef = useRef({ userId, date: today });
  const planGenerationRef = useRef(0);
  const activityGenerationRef = useRef(0);
  const profileGenerationRef = useRef(0);

  useEffect(() => {
    identityRef.current = { userId, date: today };
  }, [today, userId]);

  const currentKey = trainRequestKey(userId, today);
  const visiblePlans = useMemo(() => plansDataKey === currentKey ? plans : [], [currentKey, plans, plansDataKey]);
  const visibleActivity = useMemo(() => activityDataKey === currentKey ? activity : [], [activity, activityDataKey, currentKey]);
  const visibleOpenSession = activityDataKey === currentKey ? openSession : null;
  const visiblePlansState: LoadState = plansDataKey === currentKey ? plansState : "loading";
  const visibleActivityState: LoadState = activityDataKey === currentKey ? activityState : "loading";
  const visiblePlansError = plansDataKey === currentKey ? plansError : null;
  const visiblePlansErrorDetails = plansDataKey === currentKey ? plansErrorDetails : undefined;
  const visibleActivityError = activityDataKey === currentKey ? activityError : null;
  const visibleProfile = profileDataKey === currentKey ? profileContext : emptyTrainProfileCapabilities;

  const requestStillCurrent = useCallback((captured: TrainRequestIdentity, currentGeneration: number) => isTrainRequestCurrent(captured, {
    userId: identityRef.current.userId,
    date: identityRef.current.date,
    generation: currentGeneration
  }), []);

  const loadPlans = useCallback(async () => {
    const generation = ++planGenerationRef.current;
    const captured: TrainRequestIdentity = { userId, date: today, generation };
    const key = trainRequestKey(userId, today);
    setPlansState("loading");
    setPlansError(null);
    setPlansErrorDetails(undefined);
    setPlans([]);
    setPlansDataKey("");
    if (!userId) {
      if (requestStillCurrent(captured, planGenerationRef.current)) {
        setPlansState("loaded");
        setPlansDataKey(key);
      }
      return;
    }
    try {
      const nextPlans = await getAllUserWorkoutPlans(userId);
      if (!requestStillCurrent(captured, planGenerationRef.current)) return;
      setPlans(nextPlans);
      setPlansDataKey(key);
      setPlansState("loaded");
    } catch (error) {
      if (!requestStillCurrent(captured, planGenerationRef.current)) return;
      logRecoverableError("train-overview.plans", error);
      setPlansError(userSafeError(error, tr("planLoadFailedDescription")));
      setPlansErrorDetails(technicalErrorDetails(error));
      setPlansDataKey(key);
      setPlansState("failed");
    }
  }, [requestStillCurrent, today, tr, userId]);

  const loadTodayStatus = useCallback(async () => {
    const generation = ++activityGenerationRef.current;
    const captured: TrainRequestIdentity = { userId, date: today, generation };
    const key = trainRequestKey(userId, today);
    setActivityState("loading");
    setActivityError(null);
    setActivity([]);
    setOpenSession(null);
    setHistoryAvailable(false);
    setActivityDataKey("");
    if (!userId) {
      if (requestStillCurrent(captured, activityGenerationRef.current)) {
        setActivityDataKey(key);
        setActivityState("loaded");
      }
      return;
    }
    const [historyResult, openResult] = await Promise.allSettled([
      getWorkoutActivity(userId, 180, { throwOnError: true }),
      getOpenWorkoutSessionWithStatus(userId)
    ]);
    if (!requestStillCurrent(captured, activityGenerationRef.current)) return;
    let failed = false;
    let nextActivity: WorkoutSession[] = [];
    let nextOpenSession: WorkoutSession | null = null;
    let nextHistoryAvailable = false;
    if (historyResult.status === "fulfilled") {
      nextActivity = historyResult.value;
      nextHistoryAvailable = true;
    } else {
      failed = true;
      logRecoverableError("train-overview.activity", historyResult.reason);
    }
    if (openResult.status === "fulfilled") {
      nextOpenSession = openResult.value.session;
      if (openResult.value.error) failed = true;
    } else {
      failed = true;
      logRecoverableError("train-overview.open-session", openResult.reason);
    }
    setActivity(nextActivity);
    setOpenSession(nextOpenSession);
    setHistoryAvailable(nextHistoryAvailable);
    setActivityError(failed ? tr("activityUnavailable") : null);
    setActivityDataKey(key);
    setActivityState(failed ? "failed" : "loaded");
  }, [requestStillCurrent, today, tr, userId]);

  const loadProfileContext = useCallback(async () => {
    const generation = ++profileGenerationRef.current;
    const captured: TrainRequestIdentity = { userId, date: today, generation };
    const key = trainRequestKey(userId, today);
    setProfileContext(emptyTrainProfileCapabilities);
    setProfileDataKey("");
    if (!userId) {
      if (requestStillCurrent(captured, profileGenerationRef.current)) {
        setProfileContext({ ...emptyTrainProfileCapabilities, state: "loaded" });
        setProfileDataKey(key);
      }
      return;
    }
    try {
      const nextProfile = await getDashboardProfileContext(userId);
      if (!requestStillCurrent(captured, profileGenerationRef.current)) return;
      setProfileContext(nextProfile);
      setProfileDataKey(key);
    } catch (error) {
      if (!requestStillCurrent(captured, profileGenerationRef.current)) return;
      logRecoverableError("train-overview.prompt-profile", error);
      setProfileContext({ ...emptyTrainProfileCapabilities, state: "failed" });
      setProfileDataKey(key);
    }
  }, [requestStillCurrent, today, userId]);

  useEffect(() => {
    planGenerationRef.current += 1;
    activityGenerationRef.current += 1;
    profileGenerationRef.current += 1;
    setPlans([]);
    setPlansDataKey("");
    setActivity([]);
    setOpenSession(null);
    setActivityDataKey("");
    setHistoryAvailable(false);
    setProfileContext(emptyTrainProfileCapabilities);
    setProfileDataKey("");
    setBusyPlanId(null);
    void loadPlans();
    void loadTodayStatus();
    void loadProfileContext();
  }, [loadPlans, loadProfileContext, loadTodayStatus]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    return startTrainLocalDateRefresh({
      initialDate: today,
      onDateChange: setToday,
      onWake: () => { void loadTodayStatus(); },
      dependencies: {
        getNow: () => new Date(),
        setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimer: (timer) => window.clearTimeout(timer),
        windowTarget: window,
        documentTarget: document,
        isDocumentVisible: () => document.visibilityState === "visible"
      }
    });
  }, [loadTodayStatus, today]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => { void loadTodayStatus(); };
    window.addEventListener(activeWorkoutEvent, refresh);
    return () => window.removeEventListener(activeWorkoutEvent, refresh);
  }, [loadTodayStatus]);

  const availablePlans = useMemo(() => visiblePlans.filter((plan) => !plan.archived_at), [visiblePlans]);
  const archivedPlans = useMemo(() => visiblePlans.filter((plan) => Boolean(plan.archived_at)), [visiblePlans]);
  const activePlan = useMemo(
    () => availablePlans.find((plan) => plan.is_active) ?? availablePlans.find((plan) => plan.is_default) ?? null,
    [availablePlans]
  );
  const otherPlans = useMemo(() => availablePlans.filter((plan) => plan.id !== activePlan?.id), [activePlan?.id, availablePlans]);
  const activeDays = useMemo(() => (activePlan ? calendarDaysFromPlan(activePlan) : []), [activePlan]);
  const todayWeekday = englishWeekdays[new Date(`${today}T12:00:00`).getDay()];
  const scheduledPlanDay = useMemo(
    () => activePlan?.days.find((day) => day.weekday === todayWeekday && day.exercises.length > 0) ?? null,
    [activePlan, todayWeekday]
  );
  const todayDay = useMemo(
    () => activeDays.find((day) => day.weekday === todayWeekday && day.exercises.length > 0) ?? null,
    [activeDays, todayWeekday]
  );
  const nextDay = useMemo(() => nextScheduledDay(activeDays, todayWeekday), [activeDays, todayWeekday]);
  const openPlanContext = useMemo(() => findOpenSessionPlanContext(visiblePlans, visibleOpenSession), [visibleOpenSession, visiblePlans]);
  const displayedTodayPlan = visibleOpenSession ? openPlanContext.plan : activePlan;
  const displayedTodayDay = visibleOpenSession && openPlanContext.plan && openPlanContext.day
    ? calendarDaysFromPlan(openPlanContext.plan).find((day) => day.id === openPlanContext.day?.id) ?? null
    : visibleOpenSession
      ? null
      : todayDay;
  const resolvedPlanDayId = visibleOpenSession?.plan_day_id ?? displayedTodayDay?.id ?? null;
  const todayResolution = useMemo(() => resolveTodayWorkout({
    today,
    planDayId: resolvedPlanDayId,
    openSessionId: visibleOpenSession?.id ?? null,
    sessions: visibleActivity
  }), [resolvedPlanDayId, today, visibleActivity, visibleOpenSession?.id]);
  const todayActionHref = todayWorkoutActionHref(todayResolution, resolvedPlanDayId, visibleOpenSession);
  const promptPlan = visibleOpenSession ? openPlanContext.plan : activePlan;
  const promptDay = visibleOpenSession ? openPlanContext.day : scheduledPlanDay;
  const trainPromptContext = useMemo(() => buildTrainQuickPromptContext({
    date: today,
    plan: promptPlan,
    day: promptDay,
    resolution: todayResolution,
    openSession: visibleOpenSession,
    historyCount: activityDataKey === currentKey && historyAvailable ? visibleActivity.length : null,
    profile: visibleProfile
  }), [activityDataKey, currentKey, historyAvailable, promptDay, promptPlan, today, todayResolution, visibleActivity.length, visibleOpenSession, visibleProfile]);

  useEffect(() => {
    setDashboardContext(trainPromptContext);
  }, [setDashboardContext, trainPromptContext]);

  useEffect(() => () => {
    setDashboardContext(clearedTrainQuickPromptContext());
  }, [setDashboardContext]);

  function openTrainPrompts(promptId?: string) {
    setDashboardContext(trainPromptContext);
    openPrompts(promptId);
  }

  async function setActive(plan: UserWorkoutPlan) {
    if (!userId || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await setDefaultUserWorkoutPlan(userId, plan.id);
      await loadPlans();
      toast({ title: tr("activePlanUpdated"), description: tr("activePlanUpdatedDescription", { name: plan.name }) });
    } catch (error) {
      toast({ title: tr("activateFailed"), description: userSafeError(error, tr("activateFailedDescription")), variant: "error" });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function duplicatePlan(plan: UserWorkoutPlan) {
    if (!userId || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await duplicateWorkoutPlan(userId, plan.id);
      await loadPlans();
      toast({ title: tr("planDuplicated"), description: tr("planDuplicatedDescription", { name: plan.name }) });
    } catch (error) {
      toast({ title: tr("duplicateFailed"), description: userSafeError(error, tr("duplicateFailedDescription")), variant: "error" });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function archivePlan(plan: UserWorkoutPlan) {
    if (!userId || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await archiveWorkoutPlan(userId, plan.id);
      await loadPlans();
      toast({ title: tr("planArchived"), description: tr("planArchivedDescription") });
    } catch (error) {
      toast({ title: tr("archiveFailed"), description: userSafeError(error, tr("archiveFailedDescription")), variant: "error" });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function deletePlan(plan: UserWorkoutPlan) {
    if (!userId || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await deleteWorkoutPlan(userId, plan.id);
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

  const showTodayCard = Boolean(visibleOpenSession) || (visiblePlansState === "loaded" && Boolean(activePlan));

  return (
    <div className="space-y-6" dir={dir}>
      <PageHeading
        title={tr("myWorkout")}
        description={tr("overviewDescription")}
        action={visiblePlansState === "loaded" && !availablePlans.length ? undefined : (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button type="button" variant="outline" className="min-h-12 w-full sm:w-auto" onClick={() => openTrainPrompts()}>
              <Bot className="h-4 w-4" /> {tr("askChatGpt")}
            </Button>
            <ActionMenu label={tr("createPlan")} visibleLabel={tr("createPlan")} icon={<Plus className="h-4 w-4" />} triggerVariant="default" triggerClassName="min-h-12 w-full sm:w-auto">
              <ActionMenuItem onSelect={() => openTrainPrompts("create-workout-plan")}>{tr("createWithChatGpt")}</ActionMenuItem>
              <ActionMenuItem onSelect={() => router.push("/my-workout/plans/builder")}>{tr("createManually")}</ActionMenuItem>
            </ActionMenu>
          </div>
        )}
      />

      {visiblePlansState === "loading" ? <CardGridSkeleton count={3} rows={3} /> : null}
      {visiblePlansState === "failed" ? (
        <ErrorState
          title={tr("planLoadFailed")}
          description={visiblePlansError ?? tr("tryAgain")}
          onRetry={loadPlans}
          details={visiblePlansErrorDetails}
        />
      ) : null}

      {showTodayCard ? (
        <TodayCard
          plan={displayedTodayPlan}
          day={displayedTodayDay}
          nextDay={nextDay}
          openSession={visibleOpenSession}
          today={today}
          resolution={todayResolution}
          actionHref={todayActionHref}
          statusState={visibleActivityState}
          statusError={visibleActivityError}
          onRetryStatus={loadTodayStatus}
        />
      ) : null}

      {visiblePlansState === "loaded" && !availablePlans.length ? (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-xl font-semibold">{tr("createFirstPlan")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{tr("createFirstPlanDescription")}</p>
            </div>
            <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-12" onClick={() => openTrainPrompts("create-workout-plan")}><Bot className="h-4 w-4" /> {tr("createWithChatGpt")}</Button><Button variant="outline" className="min-h-12" onClick={() => router.push("/my-workout/plans/builder")}><Plus className="h-4 w-4" /> {tr("createManually")}</Button></div>
          </CardContent>
        </Card>
      ) : null}

      {visiblePlansState === "loaded" && availablePlans.length > 0 && !activePlan ? (
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

      {visiblePlansState === "loaded" && activePlan ? (
        <>
          <ThisWeek
            days={activeDays}
            sessions={visibleActivity}
            weekStartsOn={settings.weekStartsOn}
            today={today}
            todayPlanDayId={resolvedPlanDayId}
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

      {visiblePlansState === "loaded" && otherPlans.length ? (
        <section aria-labelledby="other-plans-heading" className="space-y-3">
          <SectionHeading id="other-plans-heading" title={tr("otherPlans")} description={tr("otherPlansDescription")} />
          <div className="grid gap-3 lg:grid-cols-2">
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

      {visiblePlansState === "loaded" && archivedPlans.length ? (
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

      {visiblePlansState === "loaded" ? (
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
  openSession,
  today,
  resolution,
  actionHref,
  statusState,
  statusError,
  onRetryStatus
}: {
  plan: UserWorkoutPlan | null;
  day: CalendarDay | null;
  nextDay: CalendarDay | null;
  openSession: WorkoutSession | null;
  today: string;
  resolution: ReturnType<typeof resolveTodayWorkout>;
  actionHref: string | null;
  statusState: LoadState;
  statusError: string | null;
  onRetryStatus: () => Promise<void>;
}) {
  const { locale, tr } = useTrainTranslation();
  const preview = day?.exercises.slice(0, 3) ?? [];
  const remaining = Math.max(0, (day?.exercises.length ?? 0) - preview.length);
  const duration = plan ? (plan as PlanMeta).session_duration_minutes : null;
  const active = resolution.state === "active";
  const actionLabel = active ? tr("resumeWorkout") : resolution.state === "completed" ? tr("viewCompletedWorkout") : resolution.state === "skipped" ? tr("skippedToday") : tr("startWorkout");
  const title = active
    ? day?.dayName || openSession?.workout_day_name || openSession?.workout_name || tr("todaysWorkout")
    : day?.dayName ?? tr("todayRestDay");
  const subtitle = active
    ? plan?.name || tr("inProgress")
    : day
      ? plan?.name || ""
      : nextDay
        ? tr("nextWorkout", { workout: nextDay.dayName, weekday: localizedWeekday(nextDay.weekday, locale) })
        : plan?.name || "";
  const showActiveAction = active && Boolean(actionHref);
  const showWorkoutAction = showActiveAction || (statusState !== "loading" && !statusError && Boolean(actionHref));
  const showRestDayPlanAction = shouldShowRestDayPlanAction({
    resolutionState: resolution.state,
    hasOpenSession: Boolean(openSession),
    hasWorkoutDay: Boolean(day),
    hasPlan: Boolean(plan),
    statusState,
    statusError
  });

  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/[0.045]" data-train-today-card>
      <CardContent className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(190px,240px)] lg:items-stretch">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{tr("today")}</p>
              <span className="text-xs font-medium text-muted-foreground">{new Date(`${today}T12:00:00`).toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}</span>
              {active ? <Badge>{tr("inProgress")}</Badge> : resolution.state === "completed" ? <Badge variant="secondary">{tr("completed")}</Badge> : resolution.state === "skipped" ? <Badge variant="outline">{tr("skippedToday")}</Badge> : null}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p> : null}
            {day ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Dumbbell className="h-4 w-4" /> {tr("exercises", { count: day.exercises.length })}</span>
                {duration ? <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {tr("aboutMinutes", { count: duration })}</span> : null}
              </div>
            ) : null}

            {day && preview.length ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={tr("selectedExercises")}>
                {preview.map((exercise, index) => (
                  <li key={exercise.plan_exercise_id ?? exercise.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{exercise.name}</span><span className="block text-xs text-muted-foreground">{exercise.sets ?? 3} × {exercise.reps ?? "8–12"}{exercise.target_muscle ? ` · ${exercise.target_muscle}` : ""}</span></span>
                  </li>
                ))}
                {remaining ? <li className="flex min-h-12 items-center rounded-xl border border-dashed border-border/70 px-3 text-sm font-medium text-muted-foreground">{tr("moreExercises", { count: remaining })}</li> : null}
              </ul>
            ) : null}
          </div>

          <div className="flex min-h-28 flex-col justify-center rounded-2xl border border-border/70 bg-background/80 p-3.5">
            {statusState === "loading" && !showActiveAction ? <Button disabled className="min-h-12 w-full">{tr("checkingStatus")}</Button> : null}
            {statusState !== "loading" && statusError && !showActiveAction ? (
              <><p className="mb-3 text-sm leading-5 text-muted-foreground">{statusError}</p><Button variant="outline" className="min-h-12 w-full" onClick={() => void onRetryStatus()}><RefreshCcw className="h-4 w-4" /> {tr("retryStatus")}</Button></>
            ) : null}
            {showWorkoutAction ? (
              <Button asChild className="min-h-12 w-full"><Link href={actionHref!}>{resolution.state === "completed" ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}{actionLabel}</Link></Button>
            ) : null}
            {showRestDayPlanAction ? (
              <div className="space-y-3 text-center" data-rest-day-weekly-plan>
                <div><Dumbbell className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">{tr("restDay")}</p>{subtitle ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p> : null}</div>
                <Button asChild variant="outline" className="min-h-12 w-full"><Link href={`/my-workout/plans/${plan!.id}`}>{tr("viewWeeklyPlan")}</Link></Button>
              </div>
            ) : null}
            {statusState !== "loading" && !statusError && !actionHref && !showRestDayPlanAction ? <div className="text-center"><Dumbbell className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">{tr("restDay")}</p></div> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}



function ThisWeek({
  days,
  sessions,
  weekStartsOn,
  today,
  todayPlanDayId,
  todayResolution
}: {
  days: CalendarDay[];
  sessions: WorkoutSession[];
  weekStartsOn: "monday" | "sunday";
  today: string;
  todayPlanDayId: string | null;
  todayResolution: ReturnType<typeof resolveTodayWorkout>;
}) {
  const { locale, tr } = useTrainTranslation();
  const week = useMemo(() => buildCurrentWeek(weekStartsOn, new Date(`${today}T12:00:00`)), [today, weekStartsOn]);
  const [selectedIso, setSelectedIso] = useState(today);
  const weekIsos = useMemo(() => week.map((day) => day.iso), [week]);
  useEffect(() => {
    setSelectedIso((current) => resolveTrainWeekSelection(current, today, weekIsos));
  }, [today, weekIsos]);
  const selectedWeekDay = week.find((day) => day.iso === selectedIso) ?? week[0];
  const selectedDay = days.find((day) => day.weekday === selectedWeekDay?.weekday) ?? null;

  return (
    <section aria-labelledby="this-week-heading" className="space-y-3" data-train-week>
      <SectionHeading id="this-week-heading" title={tr("thisWeek")} description={tr("thisWeekDescription")} />
      <div className="grid snap-x grid-flow-col auto-cols-[minmax(104px,1fr)] gap-2 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible" role="tablist" aria-label={tr("thisWeek")}>
        {week.map(({ date, iso, weekday }) => {
          const planDay = days.find((day) => day.weekday === weekday) ?? null;
          const session = planDay ? sessions.find((item) => item.plan_day_id === planDay.id && workoutSessionLocalDate(item) === iso) : null;
          const isToday = iso === today;
          const isSelected = selectedIso === iso;
          const status = isToday && planDay && planDay.id === todayPlanDayId
            ? todayResolution.state
            : session?.status === "completed"
              ? "completed"
              : session?.status === "skipped"
                ? "skipped"
                : planDay
                  ? "scheduled"
                  : "rest";
          const stateLabel = status === "active" ? tr("inProgress") : status === "completed" ? tr("completed") : status === "scheduled" ? tr("scheduled") : status === "skipped" ? tr("skippedToday") : tr("rest");
          return (
            <button
              type="button"
              role="tab"
              key={iso}
              onClick={() => setSelectedIso(iso)}
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              data-week-state={status}
              data-week-selected={isSelected || undefined}
              className={`min-h-24 snap-start rounded-2xl border p-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? "border-primary bg-primary/10 ring-1 ring-primary/25" : isToday ? "border-primary/50 bg-primary/[0.04]" : "border-border/70 bg-card"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div><p className="text-xs font-semibold uppercase text-muted-foreground">{date.toLocaleDateString(locale, { weekday: "short" })}</p><p className="mt-0.5 text-base font-semibold">{date.getDate()}</p></div>
                <div className="flex flex-col items-end gap-1">{isToday ? <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{tr("todayLabel")}</Badge> : null}{isSelected && !isToday ? <span className="text-[10px] font-semibold text-primary">{tr("selectedDay")}</span> : null}</div>
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-semibold">{planDay?.dayName ?? tr("rest")}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">{status === "completed" ? <Check className="h-3.5 w-3.5 text-success" /> : <span className={`h-2 w-2 rounded-full ${status === "active" ? "bg-primary" : status === "skipped" ? "bg-warning" : status === "scheduled" ? "bg-foreground/50" : "bg-muted-foreground/40"}`} />}{stateLabel}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-2xl border border-border/70 bg-card p-4" data-selected-day-preview>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{selectedWeekDay?.date.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}</p>
            <p className="mt-1 font-semibold">{selectedDay?.dayName ?? tr("restDay")}</p>
            {selectedDay ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{tr("exercises", { count: selectedDay.exercises.length })}{selectedDay.exercises.length ? ` · ${selectedDay.exercises.slice(0, 3).map((exercise) => exercise.name).join(" · ")}` : ""}{selectedDay.exercises.length > 3 ? ` · ${tr("moreExercises", { count: selectedDay.exercises.length - 3 })}` : ""}</p> : <p className="mt-1 text-sm text-muted-foreground">{tr("restDay")}</p>}
          </div>
          {selectedDay ? <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto"><Link href={`/my-workout/plans/${selectedDay.planId}?day=${encodeURIComponent(selectedDay.id)}`}>{tr("viewDay")}</Link></Button> : null}
        </div>
      </div>
    </section>
  );
}



function ActivePlanRow({ plan, busy, onDuplicate, onArchive, onDelete }: { plan: UserWorkoutPlan; busy: boolean; onDuplicate: () => void; onArchive: () => void; onDelete: () => void }) {
  const { tr } = useTrainTranslation();
  const durationWeeks = planDurationWeeks(plan);
  return (
    <Card data-active-plan-row>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 truncate text-lg font-semibold">{plan.name}</h3><Badge>{tr("active")}</Badge><Badge variant="outline">{sourceLabel(plan, tr("sourceManual"))}</Badge></div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{tr("trainingDays", { count: plan.days.length })} · {tr("exercises", { count: planExerciseCount(plan) })}{durationWeeks ? ` · ${tr("programWeeks", { count: durationWeeks })}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
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
    <Card data-compact-plan-row>
      <CardContent className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted"><CalendarDays className="h-5 w-5" /></div>
        <Link href={`/my-workout/plans/${plan.id}`} className="min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="min-w-0 truncate text-sm font-semibold">{plan.name}</p><Badge variant="outline" className="shrink-0">{sourceLabel(plan, tr("sourceManual"))}</Badge></div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{tr("trainingDays", { count: plan.days.length })} · {tr("exercises", { count: planExerciseCount(plan) })}{durationWeeks ? ` · ${tr("programWeeks", { count: durationWeeks })}` : ""}</p>
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
    <ActionMenu label={`${tr("moreActions")}: ${plan.name}`} visibleLabel={tr("moreActions")} disabled={busy} triggerVariant="ghost" triggerClassName="min-h-11 shrink-0 px-3" icon={<MoreHorizontal className="h-4 w-4" />}>
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
    <Link href={href} className="group rounded-[18px] border border-border/70 bg-card p-3.5 transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
      </div>
    </Link>
  );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return <div><h2 id={id} className="text-lg font-semibold tracking-[-0.02em]">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}
