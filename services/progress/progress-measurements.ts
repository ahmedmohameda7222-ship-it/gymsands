"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { BodyMeasurement, ProgressEntry } from "@/types";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && userId && isUuid(userId));
}

function toNullableNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ProgressMeasurementPatch = {
  entryDate: string;
  bodyWeightKg: number | null;
  waistCm: number | null;
  notes: string | null;
  measurements: Partial<BodyMeasurement>;
};

export async function updateProgressEntryWithMeasurements(userId: string, entryId: string, patch: ProgressMeasurementPatch) {
  if (!canUseUserData(userId) || !isUuid(entryId)) throw new Error("Progress editing requires a saved account and a synced entry.");
  const client = supabase!;
  const { data, error } = await client
    .from("progress_entries")
    .update({ entry_date: patch.entryDate, body_weight_kg: patch.bodyWeightKg, waist_cm: patch.waistCm, notes: patch.notes })
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;

  const measurementPayload = {
    user_id: userId,
    progress_entry_id: entryId,
    measured_at: patch.entryDate,
    waist_cm: patch.waistCm,
    hips_cm: toNullableNumber(patch.measurements.hips_cm),
    chest_cm: toNullableNumber(patch.measurements.chest_cm),
    neck_cm: toNullableNumber(patch.measurements.neck_cm),
    shoulders_cm: toNullableNumber(patch.measurements.shoulders_cm),
    left_arm_cm: toNullableNumber(patch.measurements.left_arm_cm),
    right_arm_cm: toNullableNumber(patch.measurements.right_arm_cm),
    left_thigh_cm: toNullableNumber(patch.measurements.left_thigh_cm),
    right_thigh_cm: toNullableNumber(patch.measurements.right_thigh_cm),
    glutes_cm: toNullableNumber(patch.measurements.glutes_cm),
    calves_cm: toNullableNumber(patch.measurements.calves_cm),
    body_fat_percent: toNullableNumber(patch.measurements.body_fat_percent),
    updated_at: new Date().toISOString()
  };

  const existing = await client.from("body_measurements").select("id").eq("user_id", userId).eq("progress_entry_id", entryId).maybeSingle();
  if (existing.error) throw existing.error;
  let measurement: BodyMeasurement | null = null;
  if (existing.data?.id) {
    const updated = await client.from("body_measurements").update(measurementPayload).eq("id", existing.data.id).eq("user_id", userId).select("*").single();
    if (updated.error) throw updated.error;
    measurement = updated.data as BodyMeasurement;
  } else if (Object.values(measurementPayload).some((value) => typeof value === "number")) {
    const inserted = await client.from("body_measurements").insert(measurementPayload).select("*").single();
    if (inserted.error) throw inserted.error;
    measurement = inserted.data as BodyMeasurement;
  }

  return { ...(data as ProgressEntry), measurements: measurement };
}

export async function deleteProgressEntryWithMeasurements(userId: string, entryId: string) {
  if (!canUseUserData(userId) || !isUuid(entryId)) throw new Error("Progress deletion requires a saved synced entry.");
  const client = supabase!;
  await client.from("body_measurements").delete().eq("user_id", userId).eq("progress_entry_id", entryId);
  const { error } = await client.from("progress_entries").delete().eq("id", entryId).eq("user_id", userId);
  if (error) throw error;
  return true;
}
