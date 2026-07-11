"use client";

import { Archive, CalendarDays, Copy, Dumbbell, Edit3, MoreHorizontal, Play, Plus, RefreshCcw, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardGridSkeleton, ErrorState } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { userSafeError, logRecoverableError, technicalErrorDetails } from "@/lib/error-formatting";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getWorkoutActivity } from "@/services/database/workout-sessions";
import { archiveWorkoutPlan, deleteWorkoutPlan, duplicateWorkoutPlan, getActiveWorkoutPlan, getAllUserWorkoutPlans, updateWorkoutPlanMetadata, workoutsFromLoadedPlanDay } from "@/services/database/workout-plan-loader";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { WorkoutCalendar } from "@/components/workouts/workout-calendar";
import { Input } from "@/components/ui/input";
import { ChatGptExecutionCard } from "@/components/shared/chatgpt-execution-card";
import type { UserWorkoutPlan, WorkoutSession } from "@/types";

type PlanMeta = Omit<UserWorkoutPlan, "source"> & {
  source?: string;
  chatgpt_source?: boolean;
  program_duration_weeks?: number | null;
  duration_weeks?: number | null;
  days_per_week?: number | null;
  session_duration_minutes?: number | null;
};

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
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [activePlan, setActivePlan] = useState<UserWorkoutPlan | null>(null);
  const [activity, setActivity] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const { dialog, ask } = useConfirm();
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
  const firstAvailablePlan = availablePlans[0] ?? null;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todayIndex = activeCalendarDays.findIndex((day) => day.weekday === today && day.exercises.length > 0);
  const todayDay = todayIndex >= 0 ? activeCalendarDays[todayIndex] : null;
  const activeCalendarDayIndex = todayIndex >= 0 ? todayIndex : 0;

  function startToday() {
    if (!todayDay) {
      toast({ title: "No workout for today", description: activePlan ? `${activePlan.name} has no workout assigned today.` : "Choose an active workout plan first." });
      return;
    }
    if (todayDay.id) router.push(`/workouts/session/day/${todayDay.id}`);
  }

  function openCalendarDay(index: number) {
    const day = activeCalendarDays[index];
    if (!day?.id) return;
    router.push(`/my-workout/day/${day.id}`);
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
    if (!user?.id || busyPlanId) return;
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

  async function deletePlan(plan: UserWorkoutPlan) {
    if (!user?.id || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await deleteWorkoutPlan(user.id, plan.id);
      await loadPlans();
      toast({ title: "Plan deleted", description: `${plan.name} and its exercises were removed.` });
    } catch (error) {
      logRecoverableError("workout-plans.delete", error);
      toast({ title: "Could not delete plan", description: userSafeError(error, "The plan was not deleted. Try again.") });
    } finally {
      setBusyPlanId(null);
    }
  }

  return (
    <div className="space-y-5">
      {isLoading ? <CardGridSkeleton count={3} rows={4} /> : null}

      {!isLoading && loadError ? (
        <ErrorState title="Workout plans could not load" description={loadError} onRetry={loadPlans} fallbackLabel="Open ChatGPT setup" fallbackHref="/settings" details={loadErrorDetails} />
      ) : null}

      {!isLoading && !loadError && activePlan ? (
        <div className="space-y-4">
          <TodayTrainingHero
            activePlan={activePlan}
            todayLabel={today}
            todayDay={todayDay}
            onStartToday={startToday}
          />

          <WorkoutCalendar
            days={activeCalendarDays}
            activity={activity}
            activeDayIndex={activeCalendarDayIndex}
            onSelectDay={openCalendarDay}
            onStartToday={startToday}
          />
        </div>
      ) : null}

      {!isLoading && !loadError && !plans.length ? (
        <PlanSetupHero onCreateManual={() => router.push("/my-workout/plans/builder")} />
      ) : null}

      {!isLoading && !loadError && plans.length > 0 && !activePlan ? (
        <ChooseActivePlanHero
          firstPlan={firstAvailablePlan}
          busyPlanId={busyPlanId}
          onSetActive={setDefaultPlan}
          onCreateManual={() => router.push("/my-workout/plans/builder")}
        />
      ) : null}

      {!isLoading && !loadError && availablePlans.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Saved plan library</h2>
              <p className="mt-1 text-sm text-muted-foreground">Default plan controls today&apos;s schedule. Archived plans keep history available.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="min-h-12" onClick={loadPlans} disabled={isLoading}>
                <RefreshCcw className="h-4 w-4" /> Refresh
              </Button>
              <Button variant="outline" className="min-h-12" onClick={() => router.push("/my-workout/plans/builder")}>
                <Plus className="h-4 w-4" /> Create manually
              </Button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {availablePlans.map((plan) => {
              const exerciseCount = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
              const isDefault = plan.is_default ?? plan.is_active;
              const sourceLabel = sourceBadge(plan);
              const meta = plan as PlanMeta;
              const isPlanBusy = busyPlanId === plan.id;

              return (
                <Card key={plan.id} variant="glass" className="overflow-hidden">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-2">
                          {isDefault ? <Badge>Default</Badge> : <Badge variant="outline">{sourceLabel}</Badge>}
                        </div>
                        <h3 className="line-clamp-2 text-base font-semibold leading-6 text-foreground">{plan.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{plan.days.length} day plan - {exerciseCount} exercises{meta.session_duration_minutes ? ` - ${meta.session_duration_minutes} min` : ""}</p>
                      </div>
                      <PlanActions
                        plan={plan}
                        isDefault={isDefault}
                        busyPlanId={busyPlanId}
                        onDefault={setDefaultPlan}
                        onDuplicate={duplicatePlan}
                        onArchive={archivePlan}
                        onDelete={(p) => ask({ title: "Delete plan?", description: `This will permanently remove ${p.name} and all its days and exercises. Workout history will be kept.`, variant: "destructive", confirmLabel: "Delete", onConfirm: () => deletePlan(p) })}
                        onEdit={(nextPlan) => { setEditingPlanId(nextPlan.id); setEditName(nextPlan.name); }}
                      />
                    </div>

                    {editingPlanId === plan.id ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input className="h-12" value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Plan name" />
                        <Button className="min-h-12" onClick={() => saveMetadata(plan)} disabled={Boolean(busyPlanId)}>
                          <Save className="h-4 w-4" /> {isPlanBusy ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <PlanFact label="Days" value={String(plan.days.length)} icon={CalendarDays} />
                      <PlanFact label="Exercises" value={String(exerciseCount)} icon={Dumbbell} />
                      <PlanFact label="Duration" value={planDurationLabel(plan)} icon={CalendarDays} />
                    </div>

                    {!isDefault ? (
                      <Button type="button" variant="outline" className="min-h-12 w-full" onClick={() => setDefaultPlan(plan)} disabled={Boolean(busyPlanId)}>
                        <Star className="h-4 w-4" />
                        {isPlanBusy ? "Updating..." : "Set as active"}
                      </Button>
                    ) : null}

                    <Button asChild className="min-h-12 w-full">
                      <Link href={`/my-workout/plans/${plan.id}`}>Open Plan</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isLoading && !loadError && plans.length ? (
        <Card variant="glassStrong" className="border-primary/20">
          <CardHeader>
            <CardTitle>Add a plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              With scoped access, ChatGPT can create or update a structured plan through Plaivra tools. Successful changes appear here immediately for scheduling, tracking, editing, and correction.
            </p>
            <ChatGptExecutionCard mode="workout" />
            <Button variant="outline" className="min-h-12" onClick={() => router.push("/my-workout/plans/builder")}>
              <Plus className="h-4 w-4" /> Create manually instead
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !loadError && archivedPlans.length ? (
        <Card variant="glassStrong">
          <CardHeader><CardTitle>Archived plans</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {archivedPlans.map((plan) => (
              <div key={plan.id} className="solid-row flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-semibold">{plan.name}</p>
                  <p className="text-muted-foreground">{plan.archived_at ? new Date(plan.archived_at).toLocaleDateString() : "Archived"}</p>
                </div>
                <Button asChild variant="outline" className="min-h-12"><Link href={`/my-workout/plans/${plan.id}`}>View</Link></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {dialog}
    </div>
  );
}

function sourceBadge(plan: UserWorkoutPlan) {
  if (isChatGptPlan(plan) || plan.source === "chatgpt" || plan.source === "imported") return "ChatGPT";
  if (plan.source === "manual") return "Manual";
  return "Saved";
}

function TodayTrainingHero({
  activePlan,
  todayLabel,
  todayDay,
  onStartToday
}: {
  activePlan: UserWorkoutPlan;
  todayLabel: string;
  todayDay: ReturnType<typeof calendarDaysFromPlan>[number] | null;
  onStartToday: () => void;
}) {
  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Today&apos;s training</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {todayDay ? todayDay.dayName : "Rest day"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {todayDay
                ? `${activePlan.name} is active for ${todayLabel}. Start here, then use the calendar for the rest of the week.`
                : `${activePlan.name} is active, and no workout is assigned to ${todayLabel}. That is a normal rest-day state.`}
            </p>
          </div>
          {todayDay ? (
            <Button className="min-h-12 sm:min-w-[190px]" onClick={onStartToday}>
              <Play className="h-5 w-5" />
              Start workout
            </Button>
          ) : (
            <Button asChild variant="outline" className="min-h-12 sm:min-w-[190px]">
              <Link href={`/my-workout/plans/${activePlan.id}`}>Review active plan</Link>
            </Button>
          )}
        </div>
        {todayDay ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {todayDay.exercises.slice(0, 6).map((exercise, index) => (
              <div key={exercise.id} className="solid-row p-3">
                <p className="text-sm font-semibold">{index + 1}. {exercise.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{exercise.sets ?? 3} x {exercise.reps ?? "?"}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PlanSetupHero({ onCreateManual }: { onCreateManual: () => void }) {
  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Create your first plan</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Create a plan with ChatGPT, then track it in Plaivra</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Connect Plaivra, grant workout access, and ask ChatGPT to create the plan through an authorized tool. The saved plan appears here with direct editing and focused workout controls.
          </p>
        </div>
        <ChatGptExecutionCard mode="workout" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="min-h-12" onClick={onCreateManual}>
            <Plus className="h-4 w-4" />
            Create manually instead
          </Button>
          <Button asChild variant="ghost" className="min-h-12">
            <Link href="/settings/connections">Manage ChatGPT access</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChooseActivePlanHero({
  firstPlan,
  busyPlanId,
  onSetActive,
  onCreateManual
}: {
  firstPlan: UserWorkoutPlan | null;
  busyPlanId: string | null;
  onSetActive: (plan: UserWorkoutPlan) => void;
  onCreateManual: () => void;
}) {
  const isBusy = Boolean(firstPlan && busyPlanId === firstPlan.id);

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Training plan needed</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Choose the plan that controls today&apos;s workout</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A default plan controls the Today hero and weekly calendar. Pick a saved plan below, or import/build a new one if your training has changed.
          </p>
        </div>
        {firstPlan ? (
          <Button type="button" className="min-h-12" onClick={() => onSetActive(firstPlan)} disabled={Boolean(busyPlanId)}>
            <Star className="h-4 w-4" />
            {isBusy ? "Setting active..." : `Set ${firstPlan.name} active`}
          </Button>
        ) : (
          <Button type="button" className="min-h-12" onClick={onCreateManual}>
            <Plus className="h-4 w-4" />
            Create a current plan
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function planDurationLabel(plan: UserWorkoutPlan) {
  const meta = plan as PlanMeta;
  const weeks = meta.program_duration_weeks ?? meta.duration_weeks;
  if (weeks) return `${weeks}w`;
  return `${plan.days.length}d`;
}

function PlanFact({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CalendarDays }) {
  return <div className="glass-chip p-3"><Icon className="h-4 w-4 text-muted-foreground" /><p className="mt-1 text-lg font-semibold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

function PlanActions({ plan, isDefault, busyPlanId, onDefault, onDuplicate, onArchive, onDelete, onEdit }: { plan: UserWorkoutPlan; isDefault: boolean; busyPlanId: string | null; onDefault: (plan: UserWorkoutPlan) => void; onDuplicate: (plan: UserWorkoutPlan) => void; onArchive: (plan: UserWorkoutPlan) => void; onDelete: (plan: UserWorkoutPlan) => void; onEdit: (plan: UserWorkoutPlan) => void }) {
  const isPlanBusy = busyPlanId === plan.id;
  const isAnyPlanBusy = Boolean(busyPlanId);

  return (
    <details className="relative shrink-0">
      <summary className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" aria-label={`More actions for ${plan.name}`}>
        <MoreHorizontal className="h-4 w-4" />
      </summary>
      <div className="solid-tracking-card absolute right-0 z-20 mt-2 grid w-64 gap-1 p-2">
        <Button type="button" variant="ghost" className="min-h-12 justify-start" onClick={() => onDefault(plan)} disabled={isDefault || isAnyPlanBusy}>
          <Star className="h-4 w-4" /> {isDefault ? "Default plan" : isPlanBusy ? "Setting default..." : "Set as default"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-12 justify-start" onClick={() => onEdit(plan)} disabled={isAnyPlanBusy}>
          <Edit3 className="h-4 w-4" /> Rename
        </Button>
        <Button type="button" variant="ghost" className="min-h-12 justify-start" onClick={() => onDuplicate(plan)} disabled={isAnyPlanBusy}>
          <Copy className="h-4 w-4" /> {isPlanBusy ? "Duplicating..." : "Duplicate"}
        </Button>
        <div className="mt-1 border-t border-border/70 pt-1">
          <Button type="button" variant="ghost" className="min-h-12 w-full justify-start text-destructive hover:text-destructive" onClick={() => onArchive(plan)} disabled={isAnyPlanBusy}>
            <Archive className="h-4 w-4" /> {isPlanBusy ? "Archiving..." : "Archive"}
          </Button>
          <Button type="button" variant="ghost" className="min-h-12 w-full justify-start text-destructive hover:text-destructive" onClick={() => onDelete(plan)} disabled={isAnyPlanBusy}>
            <Trash2 className="h-4 w-4" /> {isPlanBusy ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </details>
  );
}
