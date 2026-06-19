"use client";

import { Archive, CalendarDays, Copy, Dumbbell, Edit3, MoreHorizontal, Play, Plus, RefreshCcw, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { userSafeError, logRecoverableError, technicalErrorDetails } from "@/lib/error-formatting";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getWorkoutActivity } from "@/services/database/workout-sessions";
import { archiveWorkoutPlan, deleteWorkoutPlan, duplicateWorkoutPlan, getActiveWorkoutPlan, getAllUserWorkoutPlans, updateWorkoutPlanMetadata, workoutsFromLoadedPlanDay } from "@/services/database/workout-plan-loader";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";
import { WorkoutCalendar } from "@/components/workouts/workout-calendar";
import { Input } from "@/components/ui/input";
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
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const [showBuilder, setShowBuilder] = useState(false);
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

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todayIndex = activeCalendarDays.findIndex((day) => day.weekday === today && day.exercises.length > 0);
  const todayDay = todayIndex >= 0 ? activeCalendarDays[todayIndex] : null;

  function startToday() {
    if (!todayDay) {
      toast({ title: "No workout for today", description: activePlan ? `${activePlan.name} has no workout assigned today.` : "Choose an active workout plan first." });
      return;
    }
    if (todayDay.id) router.push(`/workouts/session/day/${todayDay.id}`);
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

  const activeExerciseCount = activePlan ? activePlan.days.reduce((sum, day) => sum + day.exercises.length, 0) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Workout Plans</h2>
          <p className="text-sm text-muted-foreground">Imported plans stay primary. Manual tools are kept as backup, repair, and small-edit controls.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadPlans} disabled={isLoading}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={() => setShowBuilder((current) => !current)}>
            <Plus className="h-4 w-4" /> {showBuilder ? "Close manual fallback" : "Manual backup"}
          </Button>
        </div>
      </div>

      {isLoading ? <CardGridSkeleton count={3} rows={4} /> : null}

      {!isLoading && loadError ? (
        <ErrorState title="Workout plans could not load" description={loadError} onRetry={loadPlans} fallbackLabel="Open ChatGPT setup" fallbackHref="/settings" details={loadErrorDetails} />
      ) : null}

      {!isLoading && !loadError && activePlan ? (
        <div className="space-y-4">
          {/* Active Plan Summary */}
          <Card className="overflow-hidden border-primary/20">
            <CardContent className="grid gap-5 p-0 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="bg-primary p-5 text-primary-foreground sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Active plan</Badge>
                  {isChatGptPlan(activePlan) ? <Badge variant="outline" className="border-primary-foreground/30 text-primary-foreground">Imported</Badge> : <Badge variant="outline" className="border-primary-foreground/30 text-primary-foreground">{sourceBadge(activePlan)}</Badge>}
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight">{activePlan.name}</h2>
                <p className="mt-3 text-sm leading-6 text-primary-foreground/80">Your weekly calendar is loaded from saved active plan days and exercises. No generated or demo workout data is shown.</p>
                <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
                  <MiniStat label="Days" value={String(activePlan.days.length)} />
                  <MiniStat label="Exercises" value={String(activeExerciseCount)} />
                  <MiniStat label="Source" value={sourceBadge(activePlan)} />
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="secondary" onClick={startToday} className="h-12 text-base">
                    <Play className="h-5 w-5" /> Start today
                  </Button>
                  <Button asChild variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                    <Link href={`/my-workout/plans/${activePlan.id}`}>Open active plan</Link>
                  </Button>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <WorkoutCalendar days={activeCalendarDays} activity={activity} activeDayIndex={activeDayIndex} onSelectDay={setActiveDayIndex} onStartToday={startToday} />
              </div>
            </CardContent>
          </Card>

          {/* Today's Workout Card - prominent on mobile */}
          {todayDay ? (
            <Card className="overflow-hidden border-primary/20 shadow-luxe lg:hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Badge>Today</Badge>
                  <Badge variant="outline">{todayDay.weekday}</Badge>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{todayDay.dayName}</h3>
                <div className="mt-3 space-y-2">
                  {todayDay.exercises.map((exercise, index) => (
                    <div key={exercise.id} className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{index + 1}. {exercise.name}</p>
                      <Badge variant="outline" className="shrink-0">{exercise.sets ?? 3} x {exercise.reps ?? "?"}</Badge>
                    </div>
                  ))}
                </div>
                <Button className="mt-4 h-12 w-full text-base" onClick={startToday}>
                  <Play className="h-5 w-5" /> Start Today&apos;s Workout
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {!isLoading && !loadError && !plans.length ? (
        <EmptyState title="No workout plans yet" description="Import a workout plan from ChatGPT to start scheduling and tracking real saved exercises. The app will not show fake workout data here." actionLabel="Set up ChatGPT import" actionHref="/settings" />
      ) : null}

      {!isLoading && !loadError ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {availablePlans.map((plan) => {
            const exerciseCount = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
            const isDefault = plan.is_default ?? plan.is_active;
            const sourceLabel = sourceBadge(plan);
            const meta = plan as PlanMeta;
            return (
              <Card key={plan.id} className="overflow-hidden border-border/70">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap gap-2">
                        {isDefault ? <Badge>Default</Badge> : <Badge variant="outline">{sourceLabel}</Badge>}
                      </div>
                      <h3 className="line-clamp-2 text-base font-semibold leading-6 text-foreground">{plan.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{plan.days.length} day plan · {exerciseCount} exercises{meta.session_duration_minutes ? ` · ${meta.session_duration_minutes} min` : ""}</p>
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
                      <Input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Plan name" />
                      <Button onClick={() => saveMetadata(plan)} disabled={busyPlanId === plan.id}>
                        <Save className="h-4 w-4" /> Save
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <PlanFact label="Days" value={String(plan.days.length)} icon={CalendarDays} />
                    <PlanFact label="Exercises" value={String(exerciseCount)} icon={Dumbbell} />
                    <PlanFact label="Duration" value={planDurationLabel(plan)} icon={CalendarDays} />
                  </div>

                  <Button asChild className="w-full">
                    <Link href={`/my-workout/plans/${plan.id}`}>Open Plan</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {!isLoading && !loadError && archivedPlans.length ? (
        <Card>
          <CardHeader><CardTitle>Archived plans</CardTitle></CardHeader>
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

      <div id="manual-fallback">
        {showBuilder ? (
          <section className="space-y-3 rounded-2xl border bg-card p-4">
            <div>
              <h3 className="text-lg font-semibold">Manual backup / edit plan</h3>
              <p className="text-sm text-muted-foreground">Use this only when you need to repair an imported plan or enter a plan you already approved elsewhere.</p>
            </div>
            <WorkoutPlanBuilder loadActivePlan={false} onSaved={loadPlans} />
          </section>
        ) : null}
      </div>
      {dialog}
    </div>
  );
}

function sourceBadge(plan: UserWorkoutPlan) {
  if (isChatGptPlan(plan) || plan.source === "chatgpt" || plan.source === "imported") return "Imported";
  if (plan.source === "manual") return "Manual";
  return "Saved";
}

function planDurationLabel(plan: UserWorkoutPlan) {
  const meta = plan as PlanMeta;
  const weeks = meta.program_duration_weeks ?? meta.duration_weeks;
  if (weeks) return `${weeks}w`;
  return `${plan.days.length}d`;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-3"><p className="text-xs text-primary-foreground/70">{label}</p><p className="mt-1 truncate font-semibold">{value}</p></div>;
}

function PlanFact({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CalendarDays }) {
  return <div className="rounded-xl bg-muted/40 p-3"><Icon className="h-4 w-4 text-muted-foreground" /><p className="mt-1 text-lg font-semibold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

function PlanActions({ plan, isDefault, busyPlanId, onDefault, onDuplicate, onArchive, onDelete, onEdit }: { plan: UserWorkoutPlan; isDefault: boolean; busyPlanId: string | null; onDefault: (plan: UserWorkoutPlan) => void; onDuplicate: (plan: UserWorkoutPlan) => void; onArchive: (plan: UserWorkoutPlan) => void; onDelete: (plan: UserWorkoutPlan) => void; onEdit: (plan: UserWorkoutPlan) => void }) {
  return (
    <details className="relative shrink-0">
      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" aria-label={`More actions for ${plan.name}`}>
        <MoreHorizontal className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid w-64 gap-1 rounded-xl border bg-card p-2 shadow-luxe">
        <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onDefault(plan)} disabled={isDefault || busyPlanId === plan.id}>
          <Star className="h-4 w-4" /> {isDefault ? "Default plan" : "Set as default"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onEdit(plan)} disabled={busyPlanId === plan.id}>
          <Edit3 className="h-4 w-4" /> Rename
        </Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onDuplicate(plan)} disabled={busyPlanId === plan.id}>
          <Copy className="h-4 w-4" /> Duplicate
        </Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" onClick={() => onArchive(plan)} disabled={busyPlanId === plan.id}>
          <Archive className="h-4 w-4" /> Archive
        </Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" onClick={() => onDelete(plan)} disabled={busyPlanId === plan.id}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>
    </details>
  );
}
