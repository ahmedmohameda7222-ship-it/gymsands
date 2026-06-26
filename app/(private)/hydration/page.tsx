"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, Droplets, RefreshCcw, Target, Trash2, TrendingUp } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { addDays, startOfWeek } from "@/lib/date-utils";
import { addWaterLog, deleteWaterLog, getCalorieTargets, getNutritionWeek, getWaterLogs } from "@/services/database/nutrition";
import type { DailyNutritionSummary, WaterLog } from "@/types";

function liters(amountMl: number) {
  return `${Math.round((amountMl / 1000) * 10) / 10} L`;
}

export default function HydrationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [targetMl, setTargetMl] = useState<number | null>(null);
  const [weekData, setWeekData] = useState<DailyNutritionSummary[]>([]);
  const [manualAmountMl, setManualAmountMl] = useState("350");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const date = useTodayDate();
  const totalMl = useMemo(() => logs.reduce((sum, log) => sum + Number(log.amount_ml), 0), [logs]);
  const target = targetMl ?? 0;
  const progress = target ? Math.min(100, Math.round((totalMl / target) * 100)) : 0;
  const remainingMl = target ? Math.max(0, target - totalMl) : 0;
  const weekTotalMl = useMemo(() => weekData.reduce((sum, day) => sum + Number(day.water_ml), 0), [weekData]);
  const daysWithWater = weekData.filter((day) => Number(day.water_ml) > 0).length;
  const daysHitTarget = target ? weekData.filter((day) => Number(day.water_ml) >= target).length : 0;
  const weeklyProgress = target ? Math.min(100, Math.round((weekTotalMl / (target * 7)) * 100)) : 0;
  const averageMl = daysWithWater ? Math.round(weekTotalMl / daysWithWater) : 0;
  const currentStreak = useMemo(() => hydrationStreak(weekData, target, date), [date, target, weekData]);
  const bestStreak = useMemo(() => bestHydrationStreak(weekData, target), [target, weekData]);
  const reminderSuggestion = buildReminderSuggestion({ target, totalMl, remainingMl, logs });

  async function loadHydration() {
    if (!user?.id) return;
    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const [water, targets, week] = await Promise.all([
        getWaterLogs(user.id, date),
        getCalorieTargets(user.id),
        getNutritionWeek(user.id, startOfWeek(date))
      ]);
      setLogs(water);
      setTargetMl(targets?.water_ml ?? null);
      setWeekData(week);
    } catch (error) {
      logRecoverableError("hydration.load", error);
      const message = userSafeError(error, "Something went wrong while loading hydration. Please try again.");
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: "Could not load hydration", description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadHydration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function quickAdd(amountMl: number) {
    if (!user?.id || isSaving) return;
    setIsSaving(true);
    try {
      const log = await addWaterLog(user.id, date, amountMl);
      setLogs((current) => [log, ...current]);
      setWeekData((current) => current.map((day) => (day.date === date ? { ...day, water_ml: day.water_ml + amountMl } : day)));
      toast({ title: "Water logged", description: `${amountMl} ml added to today.` });
    } catch (error) {
      logRecoverableError("hydration.add", error);
      toast({ title: "Could not add water", description: userSafeError(error, "Water was not logged. Please try again.") });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeLog(log: WaterLog) {
    if (!user?.id || isSaving) return;
    setIsSaving(true);
    try {
      await deleteWaterLog(user.id, log.id);
      setLogs((current) => current.filter((item) => item.id !== log.id));
      setWeekData((current) => current.map((day) => (day.date === date ? { ...day, water_ml: Math.max(0, day.water_ml - Number(log.amount_ml)) } : day)));
      toast({ title: "Water entry removed", description: "Today total was updated." });
    } catch (error) {
      logRecoverableError("hydration.delete", error);
      toast({ title: "Could not remove entry", description: userSafeError(error, "Please try again.") });
    } finally {
      setIsSaving(false);
    }
  }

  function addManualAmount() {
    const amount = Number(manualAmountMl);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Check amount", description: "Enter water in milliliters, for example 350." });
      return;
    }
    void quickAdd(Math.round(amount));
  }

  return (
    <>
      <PageHeading
        title="Hydration"
        description="Track today's water from the same account-backed logs used by the dashboard and calorie tracker."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/calories">Edit Targets</Link>
          </Button>
        }
      />

      {loadError ? (
        <ErrorState
          title="Hydration could not load"
          description={loadError}
          onRetry={loadHydration}
          fallbackLabel="Open calories"
          fallbackHref="/calories"
          details={loadErrorDetails}
        />
      ) : null}

      {!loadError ? (
        <div className="space-y-4">
          {/* Today progress — mobile hero */}
          <Card variant="glassStrong">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Today</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{liters(totalMl)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {target ? `${remainingMl} ml remaining` : "Set a water target in Calories / Macros."}
                  </p>
                </div>
                <div className="glass-card flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20">
                  <Droplets className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
                </div>
              </div>
              {target ? (
                <div className="mt-4">
                  <Progress value={progress} className="h-3" />
                  <p className="mt-1.5 text-xs text-muted-foreground">{progress}% of {liters(target)} target</p>
                </div>
              ) : null}

              {/* Quick add buttons — large touch targets */}
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[250, 500, 750, 1000].map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    className="min-h-14 gap-2 text-sm sm:text-base"
                    variant="outline"
                    onClick={() => quickAdd(amount)}
                    disabled={isSaving || isLoading}
                  >
                    <Droplets className="h-4 w-4 text-primary" />
                    +{amount === 1000 ? "1 L" : `${amount} ml`}
                  </Button>
                ))}
              </div>

              {/* Manual input — compact */}
              <div className="mt-3 flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={manualAmountMl}
                  onChange={(event) => setManualAmountMl(event.target.value)}
                  aria-label="Manual water amount in milliliters"
                  placeholder="350"
                  className="h-12"
                />
                <Button type="button" className="h-12 shrink-0 px-5" onClick={addManualAmount} disabled={isSaving || isLoading}>
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent entries — compact list */}
          <Card>
            <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-normal">Recent entries</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {isLoading ? <CardGridSkeleton count={1} rows={3} /> : null}
              {!isLoading && !logs.length ? (
                <EmptyState
                  title="No water logged today"
                  description="Use quick add when you finish a glass or bottle. No placeholder hydration data is shown."
                  actionLabel="Add 500 ml"
                  onAction={() => quickAdd(500)}
                />
              ) : null}
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="solid-row flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{log.amount_ml} ml</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Remove water entry"
                      onClick={() => removeLog(log)}
                      disabled={isSaving}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Weekly hydration — compact horizontal scroll on mobile */}
          <Card variant="glassStrong">
            <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-normal">
                <CalendarDays className="h-4 w-4 text-primary" />
                Weekly hydration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <HydrationMetric
                  icon={Droplets}
                  label="Week total"
                  value={liters(weekTotalMl)}
                  detail={target ? `${weeklyProgress}% of weekly target` : `${daysWithWater} logged days`}
                />
                <HydrationMetric
                  icon={Target}
                  label="Target days"
                  value={target ? `${daysHitTarget}/7` : "Set target"}
                  detail={target ? "Days at or above target" : "Targets unlock adherence"}
                />
                <HydrationMetric
                  icon={TrendingUp}
                  label="Average logged day"
                  value={averageMl ? `${averageMl} ml` : "No logs"}
                  detail={daysWithWater ? `${daysWithWater} day${daysWithWater === 1 ? "" : "s"} with water` : "Start with one glass today"}
                />
              </div>
              {target ? <Progress value={weeklyProgress} className="mt-4 h-2" /> : null}

              {/* Mobile: horizontal scroll row of 7 compact day indicators */}
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:hidden">
                {weekData.map((day) => {
                  const amount = Number(day.water_ml);
                  const dayProgress = target ? Math.min(100, Math.round((amount / target) * 100)) : amount ? 100 : 0;
                  const isToday = day.date === date;
                  return (
                    <div
                      key={day.date}
                      className={`flex min-w-[4.5rem] flex-1 flex-col items-center rounded-[14px] border p-2 text-center ${isToday ? "border-primary/40 bg-primary/5" : "border-white/50 bg-white/35 dark:border-white/10 dark:bg-white/5"}`}
                    >
                      <p className={`text-[10px] font-semibold uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {isToday ? "Today" : new Date(`${day.date}T00:00:00`).toLocaleDateString([], { weekday: "short" })}
                      </p>
                      <p className="mt-1 text-xs font-bold">{amount ? `${amount} ml` : "—"}</p>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${dayProgress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: 7-day grid */}
              <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-7">
                {weekData.map((day) => {
                  const amount = Number(day.water_ml);
                  const dayProgress = target ? Math.min(100, Math.round((amount / target) * 100)) : amount ? 100 : 0;
                  const isToday = day.date === date;
                  return (
                    <div
                      key={day.date}
                      className={`rounded-[14px] border p-3 text-center ${isToday ? "border-primary/40 bg-primary/5" : "border-white/50 bg-white/35 dark:border-white/10 dark:bg-white/5"}`}
                    >
                      <p className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {isToday ? "Today" : new Date(`${day.date}T00:00:00`).toLocaleDateString([], { weekday: "short" })}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{amount ? `${amount} ml` : "No log"}</p>
                      <Progress value={dayProgress} className="mt-2 h-1.5" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Streak + reminder — compact row */}
          <div className="grid gap-3 sm:grid-cols-2">
            <HydrationMetric
              icon={TrendingUp}
              label="Current streak"
              value={`${currentStreak} day${currentStreak === 1 ? "" : "s"}`}
              detail={`Best this week: ${bestStreak} day${bestStreak === 1 ? "" : "s"}`}
            />
            <HydrationMetric
              icon={Bell}
              label="Reminder"
              value={reminderSuggestion.value}
              detail={reminderSuggestion.detail}
            />
          </div>

          <Button type="button" variant="ghost" size="sm" onClick={loadHydration} disabled={isLoading} className="w-full sm:w-auto">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      ) : null}
    </>
  );
}

function HydrationMetric({ icon: Icon, label, value, detail }: { icon: typeof Droplets; label: string; value: string; detail: string }) {
  return (
    <div className="glass-card p-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </p>
      <p className="mt-2 text-lg font-bold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function hydrationComplete(amountMl: number, targetMl: number) {
  return targetMl ? amountMl >= targetMl : amountMl > 0;
}

function hydrationStreak(weekData: DailyNutritionSummary[], targetMl: number, date: string) {
  let streak = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const targetDate = addDays(date, -offset);
    const day = weekData.find((item) => item.date === targetDate);
    if (!day || !hydrationComplete(Number(day.water_ml), targetMl)) break;
    streak += 1;
  }
  return streak;
}

function bestHydrationStreak(weekData: DailyNutritionSummary[], targetMl: number) {
  return weekData.reduce(
    (state, day) => {
      const nextCurrent = hydrationComplete(Number(day.water_ml), targetMl) ? state.current + 1 : 0;
      return { current: nextCurrent, best: Math.max(state.best, nextCurrent) };
    },
    { current: 0, best: 0 }
  ).best;
}

function buildReminderSuggestion({ target, totalMl, remainingMl, logs }: { target: number; totalMl: number; remainingMl: number; logs: WaterLog[] }) {
  if (!target) return { value: "Set target", detail: "A target makes reminders useful." };
  if (remainingMl <= 0) return { value: "Target hit", detail: "Use the same rhythm tomorrow." };
  const currentHour = new Date().getHours();
  const hoursLeft = Math.max(1, 22 - currentHour);
  const splits = Math.max(1, Math.min(4, Math.ceil(hoursLeft / 3)));
  const suggestedAmount = Math.min(750, Math.max(250, Math.ceil(remainingMl / splits / 50) * 50));
  if (!logs.length) return { value: `Drink ${suggestedAmount} ml now`, detail: `${remainingMl} ml left. Start with one logged glass and keep reminders browser-based.` };
  if (splits > 1) return { value: `Drink ${suggestedAmount} ml now`, detail: `You need ${remainingMl} ml left, split into ${splits} check-ins before late evening.` };
  return { value: `Drink ${remainingMl} ml`, detail: "One focused bottle or glass can close today's target." };
}
