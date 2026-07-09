"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import type { DailyNutritionSummary, FitnessHabit, SleepRecoveryLog, SupplementLog, WorkoutSession } from "@/types";

export type EnhancedSleepRecoveryInput = Omit<SleepRecoveryLog, "id" | "created_at" | "updated_at"> & {
  id?: string;
  bedtime?: string | null;
  wake_time?: string | null;
  stress_level?: string | null;
};

export type EnhancedSleepRecoveryLog = SleepRecoveryLog & {
  bedtime?: string | null;
  wake_time?: string | null;
  stress_level?: string | null;
};

export type ReminderType = "water" | "supplement" | "sleep";
export type BrowserReminder = {
  type: ReminderType;
  label: string;
  time: string;
  enabled: boolean;
};

const reminderPrefix = "plaivra-browser-reminders";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && userId && isUuid(userId));
}

function storageKey(userId: string | null | undefined) {
  return `${reminderPrefix}:${userId || "anonymous"}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string, fallback: T): T {
  // TODO(migration): Move wellness history to Supabase
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(key.replace("plaivra-", "fitlife-"));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.localStorage.removeItem(key.replace("plaivra-", "fitlife-"));
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return date.toLocaleDateString("en-CA");
}

function isIsoDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function getFitnessHabitHistory(userId: string, days = 30, options?: { throwOnError?: boolean }) {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  if (!canUseUserData(userId)) return [] as FitnessHabit[];
  const { data, error } = await supabase!
    .from("fitness_habits")
    .select("*")
    .eq("user_id", userId)
    .gte("habit_date", daysAgoIso(safeDays))
    .order("habit_date", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(safeDays * 20);
  if (error) {
    console.warn("Plaivra could not load habit history.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load habit history. ${error.message}`);
    return [];
  }
  return (data ?? []) as FitnessHabit[];
}

export async function getSupplementHistory(userId: string, days = 30, options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return [] as SupplementLog[];
  const { data, error } = await supabase!
    .from("supplement_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("supplement_date", daysAgoIso(days))
    .order("supplement_date", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("Plaivra could not load supplement history.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load supplement history. ${error.message}`);
    return [];
  }
  return (data ?? []) as SupplementLog[];
}

export async function getSleepRecoveryHistory(userId: string, limit = 30, options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return [] as EnhancedSleepRecoveryLog[];
  const { data, error } = await supabase!
    .from("sleep_recovery_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Plaivra could not load sleep and recovery history.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load sleep and recovery history. ${error.message}`);
    return [];
  }
  return (data ?? []) as EnhancedSleepRecoveryLog[];
}

export async function upsertEnhancedSleepRecoveryLog(input: EnhancedSleepRecoveryInput) {
  const payload = {
    ...input,
    notes: input.notes?.trim() || null,
    bedtime: input.bedtime || null,
    wake_time: input.wake_time || null,
    stress_level: input.stress_level || null
  };
  if (!canUseUserData(input.user_id)) {
    const now = new Date().toISOString();
    return { id: input.id ?? crypto.randomUUID(), created_at: now, updated_at: now, ...payload } as EnhancedSleepRecoveryLog;
  }
  let result = await supabase!.from("sleep_recovery_logs").upsert(payload).select("*").single();
  if (result.error && /bedtime|wake_time|stress_level|schema cache|column/i.test(result.error.message)) {
    const { bedtime: _bedtime, wake_time: _wake, stress_level: _stress, ...compatiblePayload } = payload;
    result = await supabase!.from("sleep_recovery_logs").upsert(compatiblePayload).select("*").single();
  }
  if (result.error) throw result.error;
  return result.data as EnhancedSleepRecoveryLog;
}

export function calculateStreakStats(records: Array<{ date: string; completed: boolean }>) {
  const byDate = new Map<string, boolean>();
  records.forEach((record) => {
    if (isIsoDate(record.date)) byDate.set(record.date, (byDate.get(record.date) ?? false) || record.completed);
  });
  const dates = Array.from(byDate.keys()).sort();
  if (!dates.length) return { currentStreak: 0, bestStreak: 0, missedDays: 0, history: [] as Array<{ date: string; completed: boolean }> };
  const end = todayIso();
  const maxHistoryDays = 90;
  const start = dates[0] < daysAgoIso(maxHistoryDays) ? daysAgoIso(maxHistoryDays) : dates[0];
  const history: Array<{ date: string; completed: boolean }> = [];
  for (let date = start, guard = 0; date <= end && guard < maxHistoryDays; date = addDays(date, 1), guard += 1) {
    history.push({ date, completed: byDate.get(date) ?? false });
  }
  let bestStreak = 0;
  let run = 0;
  history.forEach((item) => {
    if (item.completed) run += 1;
    else run = 0;
    bestStreak = Math.max(bestStreak, run);
  });
  let currentStreak = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!history[index].completed) break;
    currentStreak += 1;
  }
  return {
    currentStreak,
    bestStreak,
    missedDays: history.filter((item) => !item.completed).length,
    history
  };
}

export function calculateReadiness(logs: EnhancedSleepRecoveryLog[]) {
  const latest = logs[0];
  if (!latest) return { value: null as number | null, label: "Not enough recovery data", detail: "Save sleep and recovery check-ins to calculate a simple readiness estimate." };
  const sleepScore = typeof latest.hours_slept === "number" ? Math.min(40, Math.max(0, (latest.hours_slept / 8) * 40)) : null;
  const recoveryScore = ratingToScore(latest.recovery_level, true, 25);
  const fatigueScore = ratingToScore(latest.fatigue_level, false, 15);
  const sorenessScore = ratingToScore(latest.soreness_level, false, 10);
  const stressScore = ratingToScore(latest.stress_level, false, 10);
  const parts = [sleepScore, recoveryScore, fatigueScore, sorenessScore, stressScore].filter((value): value is number => value !== null);
  if (parts.length < 2) return { value: null, label: "Not enough recovery data", detail: "Needs at least two saved recovery inputs such as sleep plus fatigue/soreness/stress." };
  const value = Math.round(parts.reduce((sum, part) => sum + part, 0));
  return { value: Math.max(0, Math.min(100, value)), label: `${Math.max(0, Math.min(100, value))}% readiness estimate`, detail: "Simple non-medical estimate from saved sleep and recovery ratings only." };
}

function ratingToScore(value: string | null | undefined, higherIsBetter: boolean, max: number) {
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    const clamped = Math.max(1, Math.min(5, parsed));
    return higherIsBetter ? (clamped / 5) * max : ((6 - clamped) / 5) * max;
  }
  const clean = value.toLowerCase();
  const highWords = ["excellent", "great", "good", "low", "1"];
  const midWords = ["fair", "medium", "moderate", "3"];
  const lowWords = ["poor", "bad", "high", "5"];
  if (higherIsBetter) {
    if (highWords.some((word) => clean.includes(word))) return max;
    if (midWords.some((word) => clean.includes(word))) return max * 0.6;
    if (lowWords.some((word) => clean.includes(word))) return max * 0.25;
  } else {
    if (clean.includes("low") || clean.includes("1")) return max;
    if (midWords.some((word) => clean.includes(word))) return max * 0.6;
    if (clean.includes("high") || clean.includes("5")) return max * 0.2;
  }
  return max * 0.5;
}

export function calculateSupplementAdherence(logs: SupplementLog[]) {
  const grouped = new Map<string, { name: string; total: number; taken: number }>();
  logs.forEach((log) => {
    const key = log.name.toLowerCase();
    const current = grouped.get(key) ?? { name: log.name, total: 0, taken: 0 };
    current.total += 1;
    if (log.taken_today) current.taken += 1;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).map((item) => ({ ...item, adherence: item.total ? Math.round((item.taken / item.total) * 100) : 0 }));
}

export function getBrowserReminders(userId: string | null | undefined) {
  return readJson<BrowserReminder[]>(storageKey(userId), [
    { type: "water", label: "Water reminder", time: "11:00", enabled: false },
    { type: "supplement", label: "Supplement reminder", time: "09:00", enabled: false },
    { type: "sleep", label: "Sleep reminder", time: "22:30", enabled: false }
  ]);
}

export function saveBrowserReminders(userId: string | null | undefined, reminders: BrowserReminder[]) {
  writeJson(storageKey(userId), reminders);
  return reminders;
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported" as const;
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  return await Notification.requestPermission();
}

export function buildDailyChecklist({
  nutrition,
  habits,
  supplements,
  sleep,
  workoutActivity
}: {
  nutrition: DailyNutritionSummary | null;
  habits: FitnessHabit[];
  supplements: SupplementLog[];
  sleep: EnhancedSleepRecoveryLog[];
  workoutActivity: WorkoutSession[];
}) {
  const today = todayIso();
  const todayWorkout = workoutActivity.find((session) => (session.completed_at ?? session.skipped_at ?? session.started_at)?.slice(0, 10) === today);
  const proteinLogged = nutrition && nutrition.protein_g > 0;
  return [
    { label: "Water", complete: Boolean(nutrition && nutrition.water_ml > 0), detail: nutrition ? `${nutrition.water_ml} ml logged today` : "No water log today" },
    { label: "Supplements", complete: supplements.length > 0 && supplements.every((item) => item.taken_today), detail: supplements.length ? `${supplements.filter((item) => item.taken_today).length}/${supplements.length} taken` : "No supplement schedule for today" },
    { label: "Sleep / recovery", complete: sleep.some((item) => item.log_date === today), detail: sleep.some((item) => item.log_date === today) ? "Recovery check-in saved today" : "No sleep/recovery check-in today" },
    { label: "Habits", complete: habits.length > 0 && habits.every((item) => item.completed), detail: habits.length ? `${habits.filter((item) => item.completed).length}/${habits.length} habits done` : "No habits set for today" },
    { label: "Steps", complete: false, detail: "Step tracking is not connected yet" },
    { label: "Workout", complete: todayWorkout?.status === "completed", detail: todayWorkout ? `${todayWorkout.workout_name}: ${todayWorkout.status}` : "No workout activity today" },
    { label: "Meals / protein", complete: Boolean(nutrition && nutrition.logs.length > 0 && proteinLogged), detail: nutrition ? `${nutrition.logs.length} food logs, ${Math.round(nutrition.protein_g)}g protein` : "No meal logs today" }
  ];
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
