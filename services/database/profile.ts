import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { Profile } from "@/types";

export { getOnboarding, saveOnboarding } from "./legacy-repository";

type ProfilePatch = {
  fullName?: string;
  targetWeightKg?: number | null;
  bodyGoal?: string | null;
};

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function cleanNumber(value: number | null | undefined) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return Number.isFinite(value) ? value : undefined;
}

export async function updateProfile(userId: string, patch: ProfilePatch) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.fullName !== undefined) {
    const fullName = patch.fullName.trim();
    if (!fullName) throw new Error("Enter your name before saving.");
    payload.full_name = fullName;
  }

  if (patch.targetWeightKg !== undefined) {
    const targetWeightKg = cleanNumber(patch.targetWeightKg);
    if (targetWeightKg !== undefined) payload.target_weight_kg = targetWeightKg;
  }

  if (patch.bodyGoal !== undefined) {
    payload.body_goal = patch.bodyGoal?.trim() || null;
  }

  if (Object.keys(payload).length <= 1) throw new Error("No profile changes provided.");

  if (!canUseUserData(userId)) return { id: userId, ...payload } as Profile;

  const { data, error } = await supabase!
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}
