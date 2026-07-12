"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { CustomMeal, FoodLog, MealType } from "@/types";

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function logSavedMealToEat({
  userId,
  meal,
  date,
  mealType,
  quantity
}: {
  userId: string;
  meal: CustomMeal;
  date: string;
  mealType: MealType;
  quantity: number;
}) {
  if (!supabase || !isUuid(userId)) throw new Error("User session invalid");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
  const payload = {
    user_id: userId,
    food_item_id: null,
    user_food_item_id: null,
    log_date: date,
    meal_type: mealType,
    food_name: meal.meal_name,
    serving_size: `${meal.items.length} foods`,
    quantity,
    calories: Math.round(finite(meal.totals.calories) * quantity),
    protein_g: Math.round(finite(meal.totals.protein_g) * quantity * 10) / 10,
    carbs_g: Math.round(finite(meal.totals.carbs_g) * quantity * 10) / 10,
    fat_g: Math.round(finite(meal.totals.fat_g) * quantity * 10) / 10,
    notes: meal.notes
  };
  const { data, error } = await supabase.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return data as FoodLog;
}
