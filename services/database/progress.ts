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

export async function getPersonalRecords(userId: string, limit = 100) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
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
  if (!canUseUserData(payload.user_id)) throw new Error("User session invalid");
  const { data, error } = await supabase!.from("personal_records").upsert(payload).select("*").single();
  if (error) throw error;
  return data as PersonalRecord;
}

type AutoPrSet = {
  exercise_name?: string | null;
  exerciseName?: string | null;
  set_number?: number | null;
  reps: number | null;
  weight_kg?: number | null;
  weightKg?: number | null;
};

type PrCandidate = {
  exerciseName: string;
  recordType: "Max weight" | "Max reps" | "Estimated 1RM" | "Best volume";
  weightKg: number | null;
  reps: number | null;
  score: number;
  notes: string;
};

function estimateOneRepMax(weightKg: number, reps: number) {
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function numeric(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function buildPersonalRecordCandidates(logs: AutoPrSet[]) {
  const byExercise = logs.reduce<Record<string, AutoPrSet[]>>((groups, log) => {
    const exerciseName = (log.exercise_name ?? log.exerciseName ?? "").trim();
    if (!exerciseName) return groups;
    groups[exerciseName] = [...(groups[exerciseName] ?? []), log];
    return groups;
  }, {});

  const candidates: PrCandidate[] = [];
  Object.entries(byExercise).forEach(([exerciseName, exerciseLogs]) => {
    const sets = exerciseLogs
      .map((log) => ({
        reps: numeric(log.reps),
        weightKg: numeric(log.weight_kg ?? log.weightKg)
      }))
      .filter((set) => set.reps !== null || set.weightKg !== null);

    const weightedSets = sets.filter((set): set is { reps: number | null; weightKg: number } => set.weightKg !== null);
    const repSets = sets.filter((set): set is { reps: number; weightKg: number | null } => set.reps !== null);

    const maxWeight = [...weightedSets].sort((a, b) => b.weightKg - a.weightKg)[0] ?? null;
    if (maxWeight) {
      candidates.push({
        exerciseName,
        recordType: "Max weight",
        weightKg: maxWeight.weightKg,
        reps: maxWeight.reps,
        score: maxWeight.weightKg,
        notes: "Auto-detected from a saved workout session."
      });
    }

    const maxReps = [...repSets].sort((a, b) => b.reps - a.reps)[0] ?? null;
    if (maxReps) {
      candidates.push({
        exerciseName,
        recordType: "Max reps",
        weightKg: maxReps.weightKg,
        reps: maxReps.reps,
        score: maxReps.reps,
        notes: "Auto-detected from a saved workout session."
      });
    }

    const oneRepMax = weightedSets
      .filter((set): set is { reps: number; weightKg: number } => set.reps !== null && set.reps > 0)
      .map((set) => ({ ...set, estimate: estimateOneRepMax(set.weightKg, set.reps) }))
      .sort((a, b) => b.estimate - a.estimate)[0] ?? null;
    if (oneRepMax) {
      candidates.push({
        exerciseName,
        recordType: "Estimated 1RM",
        weightKg: oneRepMax.estimate,
        reps: oneRepMax.reps,
        score: oneRepMax.estimate,
        notes: `Auto-detected from ${oneRepMax.weightKg} kg x ${oneRepMax.reps}.`
      });
    }

    const volume = weightedSets.reduce((sum, set) => sum + set.weightKg * Math.max(0, set.reps ?? 0), 0);
    if (volume > 0) {
      const roundedVolume = Math.round(volume * 10) / 10;
      candidates.push({
        exerciseName,
        recordType: "Best volume",
        weightKg: roundedVolume,
        reps: null,
        score: roundedVolume,
        notes: "Auto-detected total session volume in kg."
      });
    }
  });

  return candidates;
}

function existingRecordScore(record: PersonalRecord) {
  if (record.record_type === "Max reps") return numeric(record.reps) ?? 0;
  return numeric(record.weight_kg) ?? 0;
}

export async function autoDetectPersonalRecordsFromExerciseLogs(userId: string, logs: AutoPrSet[], recordDate: string) {
  if (!canUseUserData(userId) || !logs.length) return [];
  const candidates = buildPersonalRecordCandidates(logs);
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

export async function getProgressEntries(userId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
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
  if (!canUseUserData(entry.user_id)) throw new Error("User session invalid");
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
