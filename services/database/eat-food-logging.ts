"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { scaleFoodMacros } from "@/services/nutrition/calculations";
import type { CustomMeal, FoodLog, MealType } from "@/types";

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
  const macros = scaleFoodMacros(meal.totals, quantity);
  const payload = {
    user_id: userId,
    food_item_id: null,
    user_food_item_id: null,
    log_date: date,
    meal_type: mealType,
    food_name: meal.meal_name,
    serving_size: `${meal.items.length} foods`,
    quantity,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    notes: meal.notes
  };
  const { data, error } = await supabase.from("food_logs").insert(payload).select("*").single();
  if (error) throw error;
  return data as FoodLog;
}
