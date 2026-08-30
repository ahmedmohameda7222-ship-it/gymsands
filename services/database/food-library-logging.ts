"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid, todayIso } from "@/lib/utils";
import { addGlobalFoodToToday } from "@/services/database/nutrition";
import { scaleFoodMacros } from "@/services/nutrition/calculations";
import type { FoodLibraryItem, FoodLog, MealType, UserFoodItem } from "@/types";

function requireUserFoodIdentity(userId: string, food: UserFoodItem) {
  if (!supabase || !isUuid(userId)) throw new Error("User session invalid");
  if (!isUuid(food.id)) throw new Error("Invalid My Food ID.");
}

function requirePositiveQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
}

export async function addUserFoodToToday({
  userId,
  food,
  quantity,
  mealType = "Breakfast",
  date = todayIso()
}: {
  userId: string;
  food: UserFoodItem;
  quantity: number;
  mealType?: MealType;
  date?: string;
}): Promise<FoodLog> {
  requireUserFoodIdentity(userId, food);
  requirePositiveQuantity(quantity);
  const macros = scaleFoodMacros(food, quantity);
  const payload = {
    user_id: userId,
    food_item_id: null,
    user_food_item_id: food.id,
    log_date: date,
    meal_type: mealType,
    food_name: food.food_name,
    serving_size: food.serving_size,
    quantity,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    notes: food.notes
  };
  const { data, error } = await supabase.from("food_logs").insert(payload).select("id").single();
  if (error) throw error;
  if (!data?.id) throw new Error("My Food logging returned an invalid result.");
  return { id: String(data.id), ...payload };
}

export async function addFoodLibraryItemToToday({
  userId,
  food,
  quantity,
  mealType = "Breakfast",
  date = todayIso()
}: {
  userId: string;
  food: FoodLibraryItem;
  quantity: number;
  mealType?: MealType;
  date?: string;
}): Promise<FoodLog> {
  if (food.is_global) {
    return addGlobalFoodToToday({ userId, food, quantity, mealType, date });
  }
  return addUserFoodToToday({ userId, food, quantity, mealType, date });
}