"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { BodyMeasurement, PersonalRecord, ProgressEntry } from "@/types";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function mockStamped<T extends { user_id: string }>(payload: T) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), created_at: now, updated_at: now, ...payload };
}

export type PersonalRecordInput = Omit<PersonalRecord, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getPersonalRecords(userId: string, limit = 100, options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("current_personal_records")
    .select("*")
    .eq("user_id", userId)
    .order("exercise_name", { ascending: true })
    .order("record_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Plaivra could not load personal records.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load personal records. ${error.message}`);
    return [];
  }
  return (data ?? []) as PersonalRecord[];
}

export async function upsertPersonalRecord(input: PersonalRecordInput) {
  const payload = {
    ...input,
    exercise_name: input.exercise_name.trim(),
    record_type: input.record_type.trim(),
    notes: input.notes?.trim() || null
  };
  if (!payload.exercise_name) throw new Error("Exercise name is required.");
  if (!payload.record_type) throw new Error("Record type is required.");
  if (!canUseUserData(payload.user_id)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("personal_records").upsert(payload).select("*").single();
  if (error) throw error;
  return data as PersonalRecord;
}

export async function deletePersonalRecord(userId: string, id: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!.from("personal_records").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export async function getProgressEntries(userId: string, options?: { throwOnError?: boolean }) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("progress_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: true });
  if (error) {
    console.warn("Plaivra could not load progress entries.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load progress entries. ${error.message}`);
    return [];
  }

  const entries = (data ?? []) as ProgressEntry[];
  if (!entries.length) return [];

  const { data: measurements, error: measurementError } = await supabase!
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .order("measured_at", { ascending: true });

  if (measurementError) {
    console.warn("Plaivra could not load body measurements.", measurementError.message);
    if (options?.throwOnError) throw new Error(`Could not load body measurements. ${measurementError.message}`);
    return entries;
  }

  const byProgressId = new Map<string, BodyMeasurement>();
  (measurements ?? []).forEach((measurement) => {
    if (measurement.progress_entry_id) byProgressId.set(measurement.progress_entry_id, measurement as BodyMeasurement);
  });

  return entries.map((entry) => ({
    ...entry,
    measurements: byProgressId.get(entry.id) ?? null
  }));
}

export async function addProgressEntry(
  entry: Omit<ProgressEntry, "id">,
  measurements?: Record<string, number | null>
) {
  if (!canUseUserData(entry.user_id)) throw new Error("User session invalid");
  const client = supabase!;
  const { data, error } = await client.from("progress_entries").insert(entry).select("*").single();
  if (error) throw error;
  let savedMeasurement: BodyMeasurement | null = null;

  if (measurements && Object.values(measurements).some((value) => value !== null)) {
    const { data: measurementData, error: measurementError } = await client
      .from("body_measurements")
      .insert({
        user_id: entry.user_id,
        progress_entry_id: data.id,
        measured_at: entry.entry_date,
        waist_cm: entry.waist_cm,
        ...measurements
      })
      .select("*")
      .single();
    if (measurementError) throw measurementError;
    savedMeasurement = measurementData as BodyMeasurement;
  }

  return { ...(data as ProgressEntry), measurements: savedMeasurement };
}
