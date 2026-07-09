"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import type { DailyFitTask, FitnessHabit, SleepRecoveryLog, SupplementLog } from "@/types";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function mockStamped<T extends { user_id: string }>(payload: T) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), created_at: now, updated_at: now, ...payload };
}

export type DailyFitTaskInput = Omit<DailyFitTask, "id" | "created_at" | "updated_at"> & { id?: string };
export type FitnessHabitInput = Omit<FitnessHabit, "id" | "created_at" | "updated_at"> & { id?: string };
export type SleepRecoveryInput = Omit<SleepRecoveryLog, "id" | "created_at" | "updated_at"> & { id?: string };
export type SupplementLogInput = Omit<SupplementLog, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getDailyFitTasks(userId: string, date = todayIso(), options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("daily_fit_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("task_date", date)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("Plaivra could not load daily fit tasks.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load daily fit tasks. ${error.message}`);
    return [];
  }
  return (data ?? []) as DailyFitTask[];
}

export async function upsertDailyFitTask(input: DailyFitTaskInput) {
  const payload = { ...input, title: input.title.trim(), notes: input.notes?.trim() || null };
  if (!payload.title) throw new Error("Task title is required.");
  if (!canUseUserData(payload.user_id)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("daily_fit_tasks").upsert(payload).select("*").single();
  if (error) throw error;
  return data as DailyFitTask;
}

export async function deleteDailyFitTask(userId: string, id: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("daily_fit_tasks").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export async function getFitnessHabits(userId: string, date = todayIso(), options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("fitness_habits")
    .select("*")
    .eq("user_id", userId)
    .eq("habit_date", date)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("Plaivra could not load fitness habits.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load fitness habits. ${error.message}`);
    return [];
  }
  return (data ?? []) as FitnessHabit[];
}

export async function upsertFitnessHabit(input: FitnessHabitInput) {
  const payload = { ...input, name: input.name.trim(), notes: input.notes?.trim() || null };
  if (!payload.name) throw new Error("Habit name is required.");
  if (!canUseUserData(payload.user_id)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("fitness_habits").upsert(payload).select("*").single();
  if (error) throw error;
  return data as FitnessHabit;
}

export async function deleteFitnessHabit(userId: string, id: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("fitness_habits").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export async function getSleepRecoveryLogs(userId: string, limit = 30) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("sleep_recovery_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Plaivra could not load sleep and recovery logs.", error.message);
    return [];
  }
  return (data ?? []) as SleepRecoveryLog[];
}

export async function upsertSleepRecoveryLog(input: SleepRecoveryInput) {
  const payload = { ...input, notes: input.notes?.trim() || null };
  if (!canUseUserData(payload.user_id)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("sleep_recovery_logs").upsert(payload).select("*").single();
  if (error) throw error;
  return data as SleepRecoveryLog;
}

export async function deleteSleepRecoveryLog(userId: string, id: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("sleep_recovery_logs").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export async function getSupplementLogs(userId: string, date = todayIso(), options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("supplement_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("supplement_date", date)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("Plaivra could not load supplements.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load supplements. ${error.message}`);
    return [];
  }
  return (data ?? []) as SupplementLog[];
}

export async function upsertSupplementLog(input: SupplementLogInput) {
  const payload = {
    ...input,
    name: input.name.trim(),
    dose: input.dose?.trim() || null,
    time: input.time?.trim() || null,
    reminder: input.reminder?.trim() || null
  };
  if (!payload.name) throw new Error("Supplement name is required.");
  if (!canUseUserData(payload.user_id)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("supplement_logs").upsert(payload).select("*").single();
  if (error) throw error;
  return data as SupplementLog;
}

export async function deleteSupplementLog(userId: string, id: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("supplement_logs").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}
