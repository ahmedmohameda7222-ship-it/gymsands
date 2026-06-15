"use client";

import Link from "next/link";
import { Activity, ArrowRight, Brain, CalendarCheck, CheckCircle2, Droplets, Dumbbell, Scale, Soup, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { percent, sumFoodLogs } from "@/services/nutrition/calculations";
import type { SavedTargets } from "@/services/nutrition/targets";
import type { AggregatedReport } from "@/services/reports/reporting";
import type { FitnessHabit, FoodLog, MealPlanItem, SupplementLog, WorkoutSession } from "@/types";

export const defaultShortcutKeys = ["workout", "calories", "meal-plan", "water", "progress", "sleep"];

export function getDashboardShortcuts(todayPlanDayId: string | null) {
  return [
    { key: "workout", label: todayPlanDayId ? "Start Workout" : "Import Workout Plan", href: todayPlanDayId ? `/workouts/session/day/${todayPlanDayId}` : "/my-workout/plans", icon: Activity },
    { key: "calories", label: "Log Food", href: "/calories", icon: Utensils },
    { key: "meal-plan", label: "Meal Plan", href: "/my-meal-plan", icon: Soup },
    { key: "water", label: "Add Water", href: "/hydration", icon: Droplets },
    { key: "progress", label: "Add Progress", href: "/progress", icon: Scale },
    { key: "sleep", label: "Sleep & Recovery", href: "/sleep-recovery", icon: Brain },
    { key: "supplements", label: "Supplements", href: "/supplements", icon: CheckCircle2 },
    { key: "habits", label: "Habits", href: "/habits", icon: CalendarCheck },
    { key: "library", label: "Exercise Library", href: "/workouts", icon: Dumbbell }
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
    actions.push({ label: "Meal plan", title: `${unfinishedMeals.length} planned meal${unfinishedMeals.length === 1 ? "" : "s"} left`, reason: "FitLife keeps planned meals separate from done food logs to avoid duplicate calories.", cta: "Review meals", href: "/my-meal-plan", priority: 70 });
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
    <div className="flex h-full flex-col justify-between rounded-md border bg-card p-4">
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
  return <div className="flex items-center justify-between rounded-md border p-3"><span className="font-medium">{label}</span><span className={done ? "text-sm font-semibold text-primary" : "text-sm text-muted-foreground"}>{done ? "Done" : emptyLabel}</span></div>;
}

export function RingMetric({ icon: Icon, label, value, detail, progress }: { icon: typeof CheckCircle2; label: string; value: string; detail: string; progress: number }) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
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
