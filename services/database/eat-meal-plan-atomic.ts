"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { EatFoodLogPatch } from "@/services/database/eat";
import type { FoodLog, MealPlanItem } from "@/types";

function requireClient(userId: string) {
  if (!supabase || !isUuid(userId)) throw new Error("User session invalid");
}

function validatePatch(patch: EatFoodLogPatch) {
  if (!patch.foodName.trim()) throw new Error("Food name is required.");
  if (!patch.servingSize.trim()) throw new Error("Serving is required.");
  if (!Number.isFinite(patch.quantity) || patch.quantity <= 0) throw new Error("Quantity must be greater than zero.");
  for (const [label, value] of [["Calories", patch.calories], ["Protein", patch.proteinG], ["Carbs", patch.carbsG], ["Fat", patch.fatG]] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or higher.`);
  }
}

function rpcPatch(itemId: string, planDate: string, patch: EatFoodLogPatch) {
  return {
    p_item_id: itemId,
    p_plan_date: planDate,
    p_meal_type: patch.mealType,
    p_food_name: patch.foodName.trim(),
    p_serving_size: patch.servingSize.trim(),
    p_quantity: patch.quantity,
    p_calories: patch.calories,
    p_protein_g: patch.proteinG,
    p_carbs_g: patch.carbsG,
    p_fat_g: patch.fatG,
    p_notes: patch.notes?.trim() || null
  };
}

export async function completeMealPlanItemWithDraftAtomic({
  item,
  patch,
  updateSavedPlan
}: {
  item: MealPlanItem;
  patch: EatFoodLogPatch;
  updateSavedPlan: boolean;
}) {
  validatePatch(patch);
  requireClient(item.user_id);
  if (item.status === "skipped") throw new Error("A skipped meal cannot be marked eaten.");
  const { data, error } = await supabase!.rpc("complete_meal_plan_item_with_values", {
    p_item_id: item.id,
    p_meal_type: patch.mealType,
    p_food_name: patch.foodName.trim(),
    p_serving_size: patch.servingSize.trim(),
    p_quantity: patch.quantity,
    p_calories: patch.calories,
    p_protein_g: patch.proteinG,
    p_carbs_g: patch.carbsG,
    p_fat_g: patch.fatG,
    p_notes: patch.notes?.trim() || null,
    p_update_saved_plan: updateSavedPlan
  });
  if (error) throw error;
  const result = data as { item?: MealPlanItem; log?: FoodLog; already_done?: boolean } | null;
  if (!result?.item || !result.log) throw new Error("Meal completion returned an invalid result.");
  return { item: result.item, log: result.log, alreadyDone: Boolean(result.already_done) };
}

export async function updateEatFoodLogAtomic(userId: string, logId: string, patch: EatFoodLogPatch) {
  validatePatch(patch);
  requireClient(userId);
  if (!isUuid(logId)) throw new Error("Invalid food log ID.");

  const [logResult, linkedResult] = await Promise.all([
    supabase!.from("food_logs").select("*").eq("id", logId).eq("user_id", userId).maybeSingle(),
    supabase!.from("user_meal_plan_items").select("*").eq("food_log_id", logId).eq("user_id", userId).maybeSingle()
  ]);
  if (logResult.error) throw logResult.error;
  if (linkedResult.error) throw linkedResult.error;
  if (!logResult.data) throw new Error("Food log not found.");

  const linked = linkedResult.data as MealPlanItem | null;
  if (linked) {
    const { data, error } = await supabase!.rpc("correct_completed_meal_plan_item", rpcPatch(linked.id, linked.plan_date, patch));
    if (error) throw error;
    const result = data as { item?: MealPlanItem; log?: FoodLog } | null;
    if (!result?.item || !result.log) throw new Error("Linked food-log correction returned an invalid result.");
    return { log: result.log, linkedMeal: result.item };
  }

  const { data, error } = await supabase!.from("food_logs").update({
    food_name: patch.foodName.trim(),
    quantity: patch.quantity,
    serving_size: patch.servingSize.trim(),
    meal_type: patch.mealType,
    calories: patch.calories,
    protein_g: patch.proteinG,
    carbs_g: patch.carbsG,
    fat_g: patch.fatG,
    notes: patch.notes?.trim() || null
  }).eq("id", logId).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return { log: data as FoodLog, linkedMeal: null as MealPlanItem | null };
}
