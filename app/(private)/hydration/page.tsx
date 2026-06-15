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
import { EmptyState, ErrorState } from "@/components/ui/state-views";
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
          <Button asChild variant="outline">
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
        <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5 text-primary" />
                Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-4xl font-bold">{Math.round(totalMl / 10) / 100} L</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {target ? `${remainingMl} ml remaining from ${Math.round(target / 10) / 100} L target` : "Set a water target in Calories/Macros."}
                </p>
              </div>
              {target ? <Progress value={progress} /> : null}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {[250, 500, 750, 1000].map((amount) => (
                  <Button key={amount} type="button" className="min-h-12" variant="outline" onClick={() => quickAdd(amount)} disabled={isSaving || isLoading}>
                    <Droplets className="h-4 w-4" />
                    +{amount === 1000 ? "1 L" : `${amount} ml`}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 rounded-md border bg-muted/40 p-3 sm:grid-cols-[1fr_auto]">
                <Input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={manualAmountMl}
                  onChange={(event) => setManualAmountMl(event.target.value)}
                  aria-label="Manual water amount in milliliters"
                  placeholder="350"
                />
                <Button type="button" onClick={addManualAmount} disabled={isSaving || isLoading}>
                  Add manual amount
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <HydrationMetric icon={Target} label="Today target" value={target ? liters(target) : "Not set"} detail={target ? `${progress}% complete` : "Set target in Calories"} />
                <HydrationMetric icon={TrendingUp} label="Current streak" value={`${currentStreak} day${currentStreak === 1 ? "" : "s"}`} detail={`Best this week ${bestStreak} day${bestStreak === 1 ? "" : "s"}`} />
                <HydrationMetric icon={Bell} label="Reminder idea" value={reminderSuggestion.value} detail={reminderSuggestion.detail} />
              </div>
              <Button type="button" variant="ghost" onClick={loadHydration} disabled={isLoading}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent water entries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? <p className="text-sm text-muted-foreground">Loading real water logs...</p> : null}
              {!isLoading && !logs.length ? (
                <EmptyState
                  title="No water logged today"
                  description="Use quick add when you finish a glass or bottle. No placeholder hydration data is shown."
                  actionLabel="Add 500 ml"
                  onAction={() => quickAdd(500)}
                />
              ) : null}
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-semibold">{log.amount_ml} ml</p>
                    <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove water entry" onClick={() => removeLog(log)} disabled={isSaving}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Weekly hydration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <HydrationMetric icon={Droplets} label="Week total" value={liters(weekTotalMl)} detail={target ? `${weeklyProgress}% of weekly target` : `${daysWithWater} logged days`} />
                <HydrationMetric icon={Target} label="Target days" value={target ? `${daysHitTarget}/7` : "Set target"} detail={target ? "Days at or above target" : "Targets unlock adherence"} />
                <HydrationMetric icon={TrendingUp} label="Average logged day" value={averageMl ? `${averageMl} ml` : "No logs"} detail={daysWithWater ? `${daysWithWater} day${daysWithWater === 1 ? "" : "s"} with water` : "Start with one glass today"} />
              </div>
              {target ? <Progress value={weeklyProgress} /> : null}
              <div className="grid gap-2 sm:grid-cols-7">
                {weekData.map((day) => {
                  const amount = Number(day.water_ml);
                  const dayProgress = target ? Math.min(100, Math.round((amount / target) * 100)) : amount ? 100 : 0;
                  return (
                    <div key={day.date} className="rounded-md border p-3">
                      <p className="text-xs font-semibold text-muted-foreground">{day.date === date ? "Today" : new Date(`${day.date}T00:00:00`).toLocaleDateString([], { weekday: "short" })}</p>
                      <p className="mt-1 font-semibold">{amount ? `${amount} ml` : "No log"}</p>
                      <Progress value={dayProgress} className="mt-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function HydrationMetric({ icon: Icon, label, value, detail }: { icon: typeof Droplets; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border p-3">
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
