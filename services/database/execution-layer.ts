"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type {
  AiActionRequest,
  AiActionRequestStatus,
  AiActionType,
  DailyCheckinType,
  ExerciseAlternativeReason,
  GroceryStoreSection,
  NutritionTargetProfileType,
  UserDailyCheckin,
  UserExerciseAlternative,
  UserGroceryItem,
  UserNutritionPreferenceProfile,
  UserNutritionTargetProfile,
  UserProgressionTarget,
  UserSafetyProfile
} from "@/types";

type JsonContext = Record<string, unknown>;

function requireUser(userId: string) {
  if (!supabase || !isUuid(userId)) throw new Error("Please refresh, sign in again, and retry.");
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}

export async function createAiActionRequest(input: {
  userId: string;
  actionType: AiActionType;
  sourceType: string;
  sourceId?: string | null;
  context: JsonContext;
  userNote?: string | null;
  status?: AiActionRequestStatus;
}) {
  requireUser(input.userId);

  const now = new Date().toISOString();

  return {
    id: `local-${crypto.randomUUID()}`,
    user_id: input.userId,
    action_type: input.actionType,
    source_type: input.sourceType,
    source_id: cleanText(input.sourceId),
    status: input.status ?? "ready_for_chatgpt",
    context_json: input.context,
    user_note: cleanText(input.userNote),
    created_at: now,
    updated_at: now,
    resolved_at: null
  } as AiActionRequest;
}

export async function getAiActionRequests(userId: string, status?: AiActionRequestStatus) {
  requireUser(userId);
  let query = supabase!.from("ai_action_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query.limit(100);
  if (error) throw error;
  return (data ?? []) as AiActionRequest[];
}

export async function updateAiActionRequestStatus(userId: string, requestId: string, status: AiActionRequestStatus) {
  requireUser(userId);
  const { data, error } = await supabase!.from("ai_action_requests").update({
    status,
    resolved_at: status === "resolved" ? new Date().toISOString() : null
  }).eq("id", requestId).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data as AiActionRequest;
}

export async function getSafetyProfile(userId: string) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_safety_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as UserSafetyProfile | null;
}

export type SafetyProfileInput = Omit<UserSafetyProfile, "id" | "user_id" | "created_at" | "updated_at">;

export async function upsertSafetyProfile(userId: string, input: SafetyProfileInput) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_safety_profiles").upsert({ user_id: userId, ...input }, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data as UserSafetyProfile;
}

export async function getNutritionPreferenceProfile(userId: string) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_nutrition_preference_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as UserNutritionPreferenceProfile | null;
}

export type NutritionPreferenceInput = Omit<UserNutritionPreferenceProfile, "id" | "user_id" | "created_at" | "updated_at">;

export async function upsertNutritionPreferenceProfile(userId: string, input: NutritionPreferenceInput) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_nutrition_preference_profiles").upsert({ user_id: userId, ...input }, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data as UserNutritionPreferenceProfile;
}

export async function getProgressionTargets(userId: string, planExerciseIds?: string[]) {
  requireUser(userId);
  let query = supabase!.from("user_progression_targets").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  if (planExerciseIds?.length) query = query.in("plan_exercise_id", planExerciseIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UserProgressionTarget[];
}

export async function upsertProgressionTarget(userId: string, input: Omit<UserProgressionTarget, "id" | "user_id" | "created_at" | "updated_at">) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_progression_targets").upsert({ user_id: userId, ...input }, { onConflict: "user_id,plan_exercise_id" }).select("*").single();
  if (error) throw error;
  return data as UserProgressionTarget;
}

export async function getExerciseAlternatives(userId: string, planExerciseId?: string) {
  requireUser(userId);
  let query = supabase!.from("user_exercise_alternatives").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (planExerciseId) query = query.eq("plan_exercise_id", planExerciseId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UserExerciseAlternative[];
}

export async function createExerciseAlternative(userId: string, input: {
  plan_exercise_id: string;
  original_exercise_name: string;
  alternative_exercise_name: string;
  reason: ExerciseAlternativeReason;
  target_muscle?: string | null;
  equipment?: string | null;
  pain_friendly_note?: string | null;
  created_by?: "user" | "chatgpt";
}) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_exercise_alternatives").insert({ user_id: userId, ...input }).select("*").single();
  if (error) throw error;
  return data as UserExerciseAlternative;
}

export async function getGroceryItems(userId: string, weekStart: string) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_grocery_items").select("*").eq("user_id", userId).eq("week_start", weekStart).order("store_section").order("item_name");
  if (error) throw error;
  return (data ?? []) as UserGroceryItem[];
}

export async function upsertGroceryItem(userId: string, input: {
  id?: string;
  week_start: string;
  source_meal_plan_item_id?: string | null;
  item_name: string;
  quantity?: number | null;
  unit?: string | null;
  store_section?: GroceryStoreSection;
  checked?: boolean;
  already_have?: boolean;
  notes?: string | null;
  created_by?: "manual" | "meal_plan" | "chatgpt";
}) {
  requireUser(userId);
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    user_id: userId,
    week_start: input.week_start,
    source_meal_plan_item_id: input.source_meal_plan_item_id ?? null,
    item_name: input.item_name.trim(),
    quantity: input.quantity ?? null,
    unit: cleanText(input.unit),
    store_section: input.store_section ?? "Other",
    checked: input.checked ?? false,
    already_have: input.already_have ?? false,
    notes: cleanText(input.notes),
    created_by: input.created_by ?? "manual"
  };
  const query = input.id
    ? supabase!.from("user_grocery_items").update(payload).eq("id", input.id).eq("user_id", userId)
    : supabase!.from("user_grocery_items").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as UserGroceryItem;
}

export async function deleteGroceryItem(userId: string, itemId: string) {
  requireUser(userId);
  const { error } = await supabase!.from("user_grocery_items").delete().eq("id", itemId).eq("user_id", userId);
  if (error) throw error;
}

export async function getDailyCheckins(userId: string, startDate: string, endDate = startDate) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_daily_checkins").select("*").eq("user_id", userId).gte("checkin_date", startDate).lte("checkin_date", endDate).order("checkin_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserDailyCheckin[];
}

export async function upsertDailyCheckin(userId: string, input: Partial<Omit<UserDailyCheckin, "id" | "user_id" | "created_at" | "updated_at">> & { checkin_date: string; checkin_type: DailyCheckinType }) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_daily_checkins").upsert({ user_id: userId, ...input }, { onConflict: "user_id,checkin_date,checkin_type" }).select("*").single();
  if (error) throw error;
  return data as UserDailyCheckin;
}

export async function getNutritionTargetProfiles(userId: string) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_nutrition_target_profiles").select("*").eq("user_id", userId).order("target_type");
  if (error) throw error;
  return (data ?? []) as UserNutritionTargetProfile[];
}

export async function upsertNutritionTargetProfile(userId: string, input: {
  target_type: NutritionTargetProfileType;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_ml: number | null;
  notes: string | null;
}) {
  requireUser(userId);
  const { data, error } = await supabase!.from("user_nutrition_target_profiles").upsert({ user_id: userId, ...input }, { onConflict: "user_id,target_type" }).select("*").single();
  if (error) throw error;
  return data as UserNutritionTargetProfile;
}
