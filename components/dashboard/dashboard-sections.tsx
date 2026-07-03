"use client";

import Link from "next/link";
import { Activity, ArrowRight, Brain, CalendarCheck, CheckCircle2, ChevronDown, Droplets, Dumbbell, Moon, Pill, Scale, Soup, Utensils, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { percent, sumFoodLogs } from "@/services/nutrition/calculations";
import type { SavedTargets } from "@/services/nutrition/targets";
import type { AggregatedReport } from "@/services/reports/reporting";
import type { FitnessHabit, FoodLog, MealPlanItem, SleepRecoveryLog, SupplementLog, WorkoutSession } from "@/types";
import { useState } from "react";
import type { ReactNode } from "react";

export const defaultShortcutKeys = ["workout", "calories", "meal-plan", "water", "progress", "sleep"];

export function getDashboardShortcuts(todayPlanDayId: string | null) {
  return [
    { key: "workout", label: todayPlanDayId ? "Start Workout" : "Import Workout Plan", shortLabel: "Workout", href: todayPlanDayId ? `/workouts/session/day/${todayPlanDayId}` : "/my-workout/plans", icon: Activity },
    { key: "calories", label: "Log Food", shortLabel: "Food", href: "/calories", icon: Utensils },
    { key: "meal-plan", label: "Meal Plan", shortLabel: "Meals", href: "/my-meal-plan", icon: Soup },
    { key: "water", label: "Add Water", shortLabel: "Water", href: "/hydration", icon: Droplets },
    { key: "progress", label: "Add Progress", shortLabel: "Progress", href: "/progress", icon: Scale },
    { key: "sleep", label: "Sleep & Recovery", shortLabel: "Sleep", href: "/sleep-recovery", icon: Brain },
    { key: "supplements", label: "Supplements", shortLabel: "Supps", href: "/supplements", icon: CheckCircle2 },
    { key: "habits", label: "Habits", href: "/habits", shortLabel: "Habits", icon: CalendarCheck },
    { key: "library", label: "Exercise Library", shortLabel: "Library", href: "/workouts", icon: Dumbbell }
  ];
}

export type NextBestAction = {
  label: string;
  title: string;
  reason: string;
  cta: string;
  href?: string;
  waterAmountMl?: number;
  priority: number;
};

export function buildNextBestActions({
  logs,
  targets,
  totals,
  remaining,
  waterTotalMl,
  mealPlanItems,
  habits,
  todayPlanDayId,
  activePlanId,
  openSessionId,
  completedToday,
  latestProgressDate,
  sleepLoggedToday,
  supplements,
  today
}: {
  logs: FoodLog[];
  targets: SavedTargets | null;
  totals: ReturnType<typeof sumFoodLogs>;
  remaining: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  waterTotalMl: number;
  mealPlanItems: MealPlanItem[];
  habits: FitnessHabit[];
  todayPlanDayId: string | null;
  activePlanId: string | null;
  openSessionId: string | null;
  completedToday: boolean;
  latestProgressDate: string | null;
  sleepLoggedToday: boolean;
  supplements: SupplementLog[];
  today: string;
}) {
  const actions: NextBestAction[] = [];
  const unfinishedMeals = mealPlanItems.filter((item) => item.status !== "done");
  const breakfastOpen = unfinishedMeals.find((item) => item.meal_type === "Breakfast");
  const missingHabits = habits.filter((habit) => !habit.completed);
  const missingSupplements = supplements.filter((item) => !item.taken_today);

  if (!targets) {
    actions.push({ label: "Targets", title: "Set calorie, protein, and water targets", reason: "Next-action automation needs your saved targets before it can calculate remaining protein, calories, and water.", cta: "Set targets", href: "/calories", priority: 95 });
  }

  if (!logs.length) {
    actions.push({ label: "Food", title: "Log your first meal", reason: mealPlanItems.length ? "Planned meals do not count as eaten until you mark them done or log real food." : "No food logs are saved for today yet.", cta: "Log food", href: "/calories", priority: 90 });
  } else if (targets?.protein_g && remaining.protein_g > 0) {
    actions.push({ label: "Protein", title: `${remaining.protein_g}g protein left`, reason: `${totals.protein_g}g is logged against your ${targets.protein_g}g saved protein target.`, cta: "Add protein food", href: "/calories", priority: 76 });
  }

  if (breakfastOpen) {
    actions.push({ label: "Meal plan", title: "Breakfast is planned but not done", reason: `${breakfastOpen.food_name} is scheduled for today and has not created a food log yet.`, cta: "Open meal plan", href: "/my-meal-plan", priority: 84 });
  } else if (unfinishedMeals.length) {
    actions.push({ label: "Meal plan", title: `${unfinishedMeals.length} planned meal${unfinishedMeals.length === 1 ? "" : "s"} left`, reason: "Plaivra keeps planned meals separate from done food logs to avoid duplicate calories.", cta: "Review meals", href: "/my-meal-plan", priority: 70 });
  }

  const waterAction = hydrationAction(targets?.water_ml ?? 0, waterTotalMl);
  if (waterAction) actions.push(waterAction);

  if (!completedToday && todayPlanDayId) {
    actions.push({ label: "Workout", title: openSessionId ? "Resume today's workout" : "Start today's workout", reason: "Your active imported workout plan has a scheduled training day today.", cta: openSessionId ? "Resume workout" : "Start workout", href: `/workouts/session/day/${todayPlanDayId}`, priority: 82 });
  } else if (!activePlanId) {
    actions.push({ label: "Workout", title: "Import a workout plan", reason: "No active workout plan is saved, so the app cannot recommend a scheduled workout.", cta: "Import plan", href: "/my-workout/plans", priority: 78 });
  }

  if (!sleepLoggedToday) {
    actions.push({ label: "Recovery", title: "Sleep log missing", reason: "Recovery-aware suggestions need today's saved sleep, fatigue, soreness, or recovery rating.", cta: "Log recovery", href: "/sleep-recovery", priority: 58 });
  }

  if (missingHabits.length) {
    actions.push({ label: "Habits", title: `Protect ${missingHabits.length} habit${missingHabits.length === 1 ? "" : "s"}`, reason: `${missingHabits.slice(0, 2).map((habit) => habit.name).join(", ")} ${missingHabits.length === 1 ? "is" : "are"} still open today. Choose one small action before the day ends.`, cta: "Open habits", href: "/habits", priority: 54 });
  }

  if (missingSupplements.length) {
    actions.push({ label: "Supplements", title: `${missingSupplements.length} supplement${missingSupplements.length === 1 ? "" : "s"} still open`, reason: "These are saved supplement items for today and are not marked taken yet.", cta: "Review supplements", href: "/supplements", priority: 48 });
  }

  if (latestProgressDate !== today) {
    actions.push({ label: "Progress", title: latestProgressDate ? "Add a fresh progress entry" : "Add your first progress entry", reason: latestProgressDate ? `Latest saved progress entry is ${latestProgressDate}.` : "No saved progress entry exists yet.", cta: "Add progress", href: "/progress", priority: latestProgressDate ? 36 : 72 });
  }

  actions.push({ label: "Review", title: "Open weekly review", reason: "Weekly review summarizes real saved workouts, food logs, water, progress, habits, sleep, and PRs.", cta: "View report", href: "/calories/weekly-overview", priority: 10 });
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

function hydrationAction(targetMl: number, totalMl: number): NextBestAction | null {
  if (!targetMl) return { label: "Hydration", title: "Set a water target", reason: "Water pacing needs a saved daily target before it can calculate remaining intake.", cta: "Set target", href: "/calories", priority: 68 };
  const remainingMl = Math.max(0, targetMl - totalMl);
  if (remainingMl <= 0) return { label: "Hydration", title: "Water target hit", reason: `${totalMl} ml is saved today against your ${targetMl} ml target.`, cta: "Open hydration", href: "/hydration", priority: 16 };
  const currentHour = new Date().getHours();
  const hoursLeft = Math.max(1, 22 - currentHour);
  const suggestedSplits = Math.max(1, Math.min(4, Math.ceil(hoursLeft / 3)));
  const amountMl = Math.min(750, Math.max(250, Math.ceil(remainingMl / suggestedSplits / 50) * 50));
  return { label: "Hydration", title: `Drink ${amountMl} ml now`, reason: `${remainingMl} ml remains. Split it into ${suggestedSplits} browser-compatible check-in${suggestedSplits === 1 ? "" : "s"} before late evening.`, cta: `Add ${amountMl} ml`, waterAmountMl: amountMl, priority: totalMl === 0 ? 86 : 64 };
}

export function buildWeeklyFocus(report: AggregatedReport) {
  if (report.workoutsCompleted === null) return { title: "Complete one tracked workout", detail: "No completed or skipped workouts are saved this week, so adherence and progression cannot be judged yet." };
  if (report.nutritionDaysLogged < 4) return { title: "Log food on at least four days", detail: `${report.nutritionDaysLogged} day(s) have food logs. More logged days make calorie and protein averages useful.` };
  if (report.averageProtein !== null && report.averageProtein < 80) return { title: "Raise protein consistency", detail: `Average logged protein is ${report.averageProtein}g. Use saved high-protein foods or recipes instead of guessing.` };
  if (report.waterAverage === null) return { title: "Start water tracking", detail: "No water average can be calculated because this week has no saved water logs." };
  if (report.sleepAverage === null) return { title: "Add sleep and recovery logs", detail: "Recovery-aware workout guidance needs saved sleep or fatigue/soreness check-ins." };
  if (report.weightChange === null) return { title: "Add two progress entries", detail: "Weight and waist trends need at least two saved progress entries in the selected period." };
  return { title: "Keep the current rhythm", detail: "This week has enough saved data for workouts, nutrition, water, recovery, and progress. Review the detailed report for small adjustments." };
}

export function SmartActionCard({ item, onAddWater }: { item: NextBestAction; onAddWater: (amountMl: number) => void }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-md border border-border/70 bg-card p-4">
      <div><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{item.label}</p><p className="mt-1 font-semibold">{item.title}</p><p className="mt-2 text-sm text-muted-foreground">{item.reason}</p></div>
      {item.waterAmountMl ? <Button type="button" className="mt-4 w-full" onClick={() => onAddWater(item.waterAmountMl!)}><Droplets className="h-4 w-4" />{item.cta}</Button> : item.href ? <Button asChild className="mt-4 w-full"><Link href={item.href}>{item.cta}<ArrowRight className="h-4 w-4" /></Link></Button> : null}
    </div>
  );
}

export function buildDashboardCoaching({
  hasTargets,
  targets,
  totals,
  remaining,
  waterTotalMl,
  plannedMealsCount,
  doneMealsCount,
  todayPlanDay,
  completedToday,
  latestProgressDate,
  sleepLoggedToday,
  todayIso
}: {
  hasTargets: boolean;
  targets: SavedTargets | null;
  totals: ReturnType<typeof sumFoodLogs>;
  remaining: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  waterTotalMl: number;
  plannedMealsCount: number;
  doneMealsCount: number;
  todayPlanDay: boolean;
  completedToday: boolean;
  latestProgressDate: string | null;
  sleepLoggedToday: boolean;
  todayIso: string;
}) {
  const waterRemaining = Math.max(0, (targets?.water_ml ?? 0) - waterTotalMl);
  const foodAction = !hasTargets
    ? { value: "Set targets", detail: "Calories, protein, and water guidance unlock after targets are saved." }
    : totals.calories === 0
      ? { value: "Log first meal", detail: "Start with the meal you already ate, then adjust the rest of the day." }
      : remaining.protein_g > 0
        ? { value: `${remaining.protein_g}g protein left`, detail: "Make the next meal protein-first before chasing calories." }
        : { value: "Protein covered", detail: remaining.calories >= 0 ? `${remaining.calories} kcal left for flexible meals.` : `${Math.abs(remaining.calories)} kcal over target.` };
  const trainingAction = completedToday ? { value: "Workout done", detail: "Check PRs or add notes while the session is still fresh." } : todayPlanDay ? { value: "Start today's lift", detail: "Use previous-set autofill and save partial work if needed." } : { value: "No lift scheduled", detail: "Use today for recovery, mobility, or plan review." };
  return [
    { label: "Next food move", ...foodAction },
    { label: "Training", ...trainingAction },
    { label: "Hydration", value: targets?.water_ml ? (waterRemaining ? `${waterRemaining} ml left` : "Water target hit") : "Set water target", detail: waterRemaining ? "Use quick add instead of waiting until the end of the day." : "Keep the habit consistent tomorrow." },
    { label: "Tracking quality", value: `${[plannedMealsCount > 0 && doneMealsCount === plannedMealsCount, completedToday, latestProgressDate === todayIso, sleepLoggedToday].filter(Boolean).length}/4 closed`, detail: "Meals, workout, progress, and recovery give the cleanest weekly insight." }
  ];
}

export function MacroLine({ label, value, target }: { label: string; value: number; target: number }) {
  return <div><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted-foreground">{value}g / {target}g</span></div><Progress value={percent(value, target)} /></div>;
}

export function ChecklistLine({ label, done, emptyLabel }: { label: string; done: boolean; emptyLabel: string }) {
  return <div className="solid-row flex items-center justify-between p-3"><span className="font-medium">{label}</span><span className={done ? "text-sm font-semibold text-primary" : "text-sm text-muted-foreground"}>{done ? "Done" : emptyLabel}</span></div>;
}

export function RingMetric({ icon: Icon, label, value, detail, progress }: { icon: typeof CheckCircle2; label: string; value: string; detail: string; progress: number }) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  return (
    <div className="glass-card flex items-center gap-3 p-3">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${safeProgress}%, hsl(var(--muted)) 0)` }} aria-hidden="true"><div className="grid h-12 w-12 place-items-center rounded-full bg-card"><Icon className="h-5 w-5 text-primary" /></div></div>
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p><p className="text-sm text-muted-foreground">{detail}</p></div>
    </div>
  );
}

export function countCompletedTrainingStreak(history: WorkoutSession[]) {
  const completedDates = Array.from(new Set(history.filter((session) => session.status === "completed").map((session) => (session.completed_at ?? session.started_at)?.slice(0, 10)).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a));
  if (!completedDates.length) return 0;
  let cursor = completedDates[0];
  let streak = 0;
  while (completedDates.includes(cursor)) {
    streak += 1;
    const previous = new Date(`${cursor}T00:00:00`);
    previous.setDate(previous.getDate() - 1);
    cursor = previous.toISOString().slice(0, 10);
  }
  return streak;
}
export function CollapsibleSection({
  title,
  preview,
  children,
  defaultOpen = false,
  className
}: {
  title: string;
  preview?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("glass-card-strong text-card-foreground", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 sm:p-5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight tracking-normal">{title}</h3>
          {preview ? <p className="mt-0.5 text-sm text-muted-foreground">{preview}</p> : null}
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-white/40 p-4 sm:p-5 dark:border-white/10">{children}</div> : null}
    </div>
  );
}

export function CompactSetupChecklist({
  checklist,
  nextItem,
  completedCount,
  totalCount
}: {
  checklist: { label: string; done: boolean; href: string; action: string }[];
  nextItem: { label: string; done: boolean; href: string; action: string } | null;
  completedCount: number;
  totalCount: number;
}) {
  return (
    <div className="glass-card-strong">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:p-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {nextItem ? `Next: ${nextItem.label}` : "Setup complete"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={(completedCount / totalCount) * 100} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground">{completedCount}/{totalCount}</span>
            </div>
          </div>
        </summary>
        <div className="border-t border-white/40 p-3 sm:p-4 dark:border-white/10">
          <div className="space-y-2">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className={cn("h-4 w-4 shrink-0", item.done ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("truncate", item.done ? "text-muted-foreground line-through" : "text-foreground")}>{item.label}</span>
                </div>
                {!item.done ? (
                  <Button asChild size="sm" variant="ghost" className="shrink-0">
                    <Link href={item.href}>{item.action}</Link>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </details>
      {nextItem ? <div className="border-t border-white/40 p-3 dark:border-white/10"><Button asChild size="sm" className="w-full sm:w-auto"><Link href={nextItem.href}>{nextItem.action}</Link></Button></div> : null}
    </div>
  );
}

export function QuickLinkGrid({
  shortcuts
}: {
  shortcuts: { key: string; label: string; shortLabel: string; href: string; icon: typeof Activity }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
      {shortcuts.map((shortcut) => {
        const Icon = shortcut.icon;
        return (
          <Link
            key={shortcut.key}
            href={shortcut.href}
            className="glass-chip flex min-h-[48px] flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-white/55 sm:min-h-[56px] sm:flex-row sm:gap-2 sm:text-sm"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{shortcut.shortLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function CompactRecentActivity({
  logs,
  history
}: {
  logs: FoodLog[];
  history: WorkoutSession[];
}) {
  const hasData = logs.length > 0 || history.length > 0;
  if (!hasData) {
    return <p className="text-sm text-muted-foreground">Log a meal or workout to build your activity timeline.</p>;
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mobile-card-scroll">
      {logs.slice(0, 4).map((log) => (
        <div key={log.id} className="solid-row min-w-[160px] p-2.5 sm:min-w-[180px] sm:p-3">
          <p className="text-sm font-semibold">{log.food_name}</p>
          <p className="text-xs text-muted-foreground">{log.calories} kcal · {log.protein_g}g protein</p>
        </div>
      ))}
      {history.slice(0, 4).map((session) => (
        <div key={session.id} className="solid-row min-w-[160px] p-2.5 sm:min-w-[180px] sm:p-3">
          <p className="text-sm font-semibold">{session.workout_name}</p>
          <p className="text-xs text-muted-foreground">{session.status} · {session.duration_minutes ?? 0} min</p>
        </div>
      ))}
    </div>
  );
}

export function WellnessSummary({
  habits,
  supplements,
  sleepLogs
}: {
  habits: FitnessHabit[];
  supplements: SupplementLog[];
  sleepLogs: SleepRecoveryLog[];
}) {
  const openHabits = habits.filter((h) => !h.completed).length;
  const openSupplements = supplements.filter((s) => !s.taken_today).length;
  const latestSleep = sleepLogs.find((log) => log.hours_slept !== null) ?? null;
  const hasWellnessData = habits.length > 0 || supplements.length > 0 || sleepLogs.length > 0;

  if (!hasWellnessData) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {habits.length > 0 ? (
        <div className="solid-row p-2.5 sm:p-3">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs text-muted-foreground">Habits</p>
          </div>
          <p className="mt-1 text-sm font-semibold">{openHabits} open</p>
        </div>
      ) : null}
      {supplements.length > 0 ? (
        <div className="solid-row p-2.5 sm:p-3">
          <div className="flex items-center gap-1.5">
            <Pill className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs text-muted-foreground">Supps</p>
          </div>
          <p className="mt-1 text-sm font-semibold">{openSupplements} open</p>
        </div>
      ) : null}
      {latestSleep ? (
        <div className="solid-row p-2.5 sm:p-3">
          <div className="flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs text-muted-foreground">Sleep</p>
          </div>
          <p className="mt-1 text-sm font-semibold">{latestSleep.hours_slept ?? "-"}h</p>
        </div>
      ) : null}
    </div>
  );
}
