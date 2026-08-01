"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import {
  buildPersonalRecordCandidates,
  type DerivedMetricLog,
  type DerivedPersonalRecord,
} from "@/lib/workouts/derived-metrics";
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
    .from("personal_records")
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

type AutoPrSet = DerivedMetricLog;

type PrCandidate = {
  exerciseName: string;
  recordType: "Max weight" | "Max reps" | "Estimated 1RM" | "Best volume";
  weightKg: number | null;
  reps: number | null;
  score: number;
  notes: string;
};

function numeric(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function progressCandidate(candidate: DerivedPersonalRecord): PrCandidate {
  const recordTypes: Record<
    DerivedPersonalRecord["type"],
    PrCandidate["recordType"]
  > = {
    highest_load: "Max weight",
    max_repetitions: "Max reps",
    estimated_one_rep_max: "Estimated 1RM",
    session_volume: "Best volume",
  };
  const recordType = recordTypes[candidate.type];
  return {
    exerciseName: candidate.exerciseName,
    recordType,
    weightKg:
      candidate.type === "max_repetitions" ? candidate.externalLoadKg : candidate.value,
    reps:
      candidate.type === "max_repetitions"
        ? candidate.repetitions
        : candidate.type === "estimated_one_rep_max"
          ? candidate.repetitions
          : null,
    score: candidate.value,
    notes: `Auto-detected by ${candidate.type} (${candidate.comparableContext}).`,
  };
}

function progressCandidates(logs: AutoPrSet[]) {
  const strongest = new Map<string, PrCandidate>();
  for (const candidate of buildPersonalRecordCandidates(logs).map(progressCandidate)) {
    const key = `${candidate.exerciseName.toLocaleLowerCase("en")}::${candidate.recordType}`;
    const existing = strongest.get(key);
    if (!existing || candidate.score > existing.score) strongest.set(key, candidate);
  }
  return [...strongest.values()];
}

function existingRecordScore(record: PersonalRecord) {
  if (record.record_type === "Max reps") return numeric(record.reps) ?? 0;
  return numeric(record.weight_kg) ?? 0;
}

export async function autoDetectPersonalRecordsFromExerciseLogs(userId: string, logs: AutoPrSet[], recordDate: string) {
  if (!canUseUserData(userId) || !logs.length) return [];
  const candidates = progressCandidates(logs);
  if (!candidates.length) return [];

  const exerciseNames = Array.from(new Set(candidates.map((candidate) => candidate.exerciseName)));
  const recordTypes = Array.from(new Set(candidates.map((candidate) => candidate.recordType)));
  const { data, error } = await supabase!
    .from("personal_records")
    .select("*")
    .eq("user_id", userId)
    .in("exercise_name", exerciseNames)
    .in("record_type", recordTypes);
  if (error) throw error;

  const existingBest = new Map<string, number>();
  ((data ?? []) as PersonalRecord[]).forEach((record) => {
    const key = `${record.exercise_name.toLowerCase()}::${record.record_type}`;
    existingBest.set(key, Math.max(existingBest.get(key) ?? 0, existingRecordScore(record)));
  });

  const inserts = candidates
    .filter((candidate) => candidate.score > (existingBest.get(`${candidate.exerciseName.toLowerCase()}::${candidate.recordType}`) ?? 0))
    .map((candidate) => ({
      user_id: userId,
      exercise_name: candidate.exerciseName,
      record_type: candidate.recordType,
      weight_kg: candidate.weightKg,
      reps: candidate.reps,
      record_date: recordDate,
      notes: candidate.notes
    }));

  if (!inserts.length) return [];
  const inserted = await supabase!.from("personal_records").insert(inserts).select("*");
  if (inserted.error) throw inserted.error;
  return (inserted.data ?? []) as PersonalRecord[];
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
