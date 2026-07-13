"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { SleepRecoveryLog, WaterLog } from "@/types";

function canLoad(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

export async function getDashboardWaterLogs(userId: string, date: string): Promise<WaterLog[]> {
  if (!canLoad(userId)) return [];
  const { data, error } = await supabase!
    .from("water_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WaterLog[];
}

export async function getDashboardSleepRecoveryLogs(userId: string, limit = 7): Promise<SleepRecoveryLog[]> {
  if (!canLoad(userId)) return [];
  const { data, error } = await supabase!
    .from("sleep_recovery_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SleepRecoveryLog[];
}
