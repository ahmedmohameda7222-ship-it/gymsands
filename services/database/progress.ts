"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { BodyMeasurement, PersonalRecord, ProgressEntry } from "@/types";

function mockDelay<T>(value: T) {
  return Promise.resolve(value);
}

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function mockStamped<T extends { user_id: string }>(payload: T) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), created_at: now, updated_at: now, ...payload };
}

export type PersonalRecordInput = Omit<PersonalRecord, "id" | "created_at" | "updated_at"> & { id?: string };

export async function getPersonalRecords(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return mockDelay<PersonalRecord[]>([]);
  const { data, error } = await supabase!
    .from("personal_records")
    .select("*")
    .eq("user_id", userId)
    .order("exercise_name", { ascending: true })
    .order("record_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("FitLife Hub could not load personal records.", error.message);
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
  if (!canUseUserData(input.user_id)) return mockDelay(mockStamped(payload) as PersonalRecord);
  const { data, error } = await supabase!.from("personal_records").upsert(payload).select("*").single();
  if (error) throw error;
  return data as PersonalRecord;
}

export async function deletePersonalRecord(userId: string, id: string) {
  if (!canUseUserData(userId) || !isUuid(id)) return mockDelay(true);
  const { error } = await supabase!.from("personal_records").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  return true;
}

export async function getProgressEntries(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<ProgressEntry[]>([]);
  const { data, error } = await supabase!
    .from("progress_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: true });
  if (error) {
    console.warn("FitLife Hub could not load progress entries.", error.message);
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
    console.warn("FitLife Hub could not load body measurements.", measurementError.message);
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
  photos?: File[],
  measurements?: Record<string, number | null>
) {
  if (!canUseUserData(entry.user_id)) {
    return mockDelay({
      ...entry,
      id: crypto.randomUUID(),
      measurements: measurements
        ? ({
            id: crypto.randomUUID(),
            user_id: entry.user_id,
            progress_entry_id: null,
            measured_at: entry.entry_date,
            waist_cm: entry.waist_cm,
            created_at: new Date().toISOString(),
            ...measurements
          } as BodyMeasurement)
        : null
    } as ProgressEntry);
  }
  const client = supabase!;
  const { data, error } = await client.from("progress_entries").insert(entry).select("*").single();
  if (error) throw error;
  let savedMeasurement: BodyMeasurement | null = null;

  if (photos?.length) {
    await Promise.all(
      photos.map(async (photo) => {
        const path = `${entry.user_id}/${data.id}/${crypto.randomUUID()}-${photo.name}`;
        const upload = await client.storage.from("progress-photos").upload(path, photo, { upsert: false });
        if (upload.error) throw upload.error;
        const { error: photoError } = await client.from("progress_photos").insert({
          user_id: entry.user_id,
          progress_entry_id: data.id,
          storage_path: path
        });
        if (photoError) throw photoError;
      })
    );
  }

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
