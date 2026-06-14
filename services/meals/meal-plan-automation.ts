"use client";

import type { MealPlanItem, MealType } from "@/types";

export type MealTemplateItem = {
  food_name: string;
  meal_type: MealType;
  serving_size: string;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string | null;
};

export type MealTemplate = {
  id: string;
  user_id: string;
  name: string;
  items: MealTemplateItem[];
  notes: string | null;
  created_at: string;
};

export type BatchMeal = {
  id: string;
  user_id: string;
  name: string;
  portions: number;
  serving_size: string;
  notes: string | null;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  created_at: string;
};

export type ShoppingListItem = {
  key: string;
  food_name: string;
  category: string;
  quantity: number | null;
  serving_size: string | null;
  count: number;
  checked: boolean;
};

const templatePrefix = "fitlife-meal-templates";
const batchPrefix = "fitlife-batch-meals";
const shoppingPrefix = "fitlife-shopping-checks";

function storageKey(prefix: string, userId: string | null | undefined) {
  return `${prefix}:${userId || "anonymous"}`;
}

function canStore() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canStore()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function templateItemFromMealPlanItem(item: MealPlanItem): MealTemplateItem {
  return {
    food_name: item.food_name,
    meal_type: item.meal_type,
    serving_size: item.serving_size,
    quantity: item.quantity,
    calories: toNumber(item.calories),
    protein_g: toNumber(item.protein_g),
    carbs_g: toNumber(item.carbs_g),
    fat_g: toNumber(item.fat_g),
    notes: item.notes
  };
}

export function getMealTemplates(userId: string | null | undefined) {
  return readJson<MealTemplate[]>(storageKey(templatePrefix, userId), []);
}

export function saveMealTemplate(userId: string | null | undefined, name: string, items: MealTemplateItem[], notes?: string | null) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Template name is required.");
  if (!items.length) throw new Error("Template must include at least one planned food.");
  const template: MealTemplate = {
    id: `template-${crypto.randomUUID()}`,
    user_id: userId || "anonymous",
    name: cleanName,
    items,
    notes: notes?.trim() || null,
    created_at: new Date().toISOString()
  };
  const key = storageKey(templatePrefix, userId);
  writeJson(key, [template, ...getMealTemplates(userId)]);
  return template;
}

export function deleteMealTemplate(userId: string | null | undefined, templateId: string) {
  const key = storageKey(templatePrefix, userId);
  writeJson(key, getMealTemplates(userId).filter((template) => template.id !== templateId));
}

export function getBatchMeals(userId: string | null | undefined) {
  return readJson<BatchMeal[]>(storageKey(batchPrefix, userId), []);
}

export function saveBatchMeal(userId: string | null | undefined, input: Omit<BatchMeal, "id" | "user_id" | "created_at">) {
  const name = input.name.trim();
  if (!name) throw new Error("Batch meal name is required.");
  const portions = Math.max(1, Math.round(toNumber(input.portions)));
  const batch: BatchMeal = {
    id: `batch-${crypto.randomUUID()}`,
    user_id: userId || "anonymous",
    name,
    portions,
    serving_size: input.serving_size.trim() || "1 portion",
    notes: input.notes?.trim() || null,
    total_calories: Math.max(0, toNumber(input.total_calories)),
    total_protein_g: Math.max(0, toNumber(input.total_protein_g)),
    total_carbs_g: Math.max(0, toNumber(input.total_carbs_g)),
    total_fat_g: Math.max(0, toNumber(input.total_fat_g)),
    created_at: new Date().toISOString()
  };
  const key = storageKey(batchPrefix, userId);
  writeJson(key, [batch, ...getBatchMeals(userId)]);
  return batch;
}

export function batchMealToTemplateItem(batch: BatchMeal, mealType: MealType): MealTemplateItem {
  const portions = Math.max(1, batch.portions);
  return {
    food_name: batch.name,
    meal_type: mealType,
    serving_size: batch.serving_size || "1 portion",
    quantity: 1,
    calories: Math.round((batch.total_calories / portions) * 10) / 10,
    protein_g: Math.round((batch.total_protein_g / portions) * 10) / 10,
    carbs_g: Math.round((batch.total_carbs_g / portions) * 10) / 10,
    fat_g: Math.round((batch.total_fat_g / portions) * 10) / 10,
    notes: batch.notes ? `Batch meal: ${batch.notes}` : "Batch meal portion"
  };
}

export function buildShoppingList(items: MealPlanItem[], checkedKeys: string[] = []): ShoppingListItem[] {
  const checks = new Set(checkedKeys);
  const map = new Map<string, ShoppingListItem>();
  items.forEach((item) => {
    const foodName = item.food_name.trim();
    if (!foodName) return;
    const serving = item.serving_size?.trim() || null;
    const key = `${foodName.toLowerCase()}|${serving ?? "unknown"}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        key,
        food_name: foodName,
        category: item.meal_type,
        quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
        serving_size: serving,
        count: 1,
        checked: checks.has(key)
      });
    } else {
      current.count += 1;
      if (current.quantity !== null && Number.isFinite(Number(item.quantity))) current.quantity += Number(item.quantity);
      else current.quantity = null;
      if (!current.category.includes(item.meal_type)) current.category = `${current.category}, ${item.meal_type}`;
    }
  });
  return Array.from(map.values()).sort((a, b) => a.food_name.localeCompare(b.food_name));
}

export function getCheckedShoppingKeys(userId: string | null | undefined, weekStart: string) {
  return readJson<string[]>(`${storageKey(shoppingPrefix, userId)}:${weekStart}`, []);
}

export function setShoppingItemChecked(userId: string | null | undefined, weekStart: string, key: string, checked: boolean) {
  const storage = `${storageKey(shoppingPrefix, userId)}:${weekStart}`;
  const current = new Set(getCheckedShoppingKeys(userId, weekStart));
  if (checked) current.add(key);
  else current.delete(key);
  const next = Array.from(current);
  writeJson(storage, next);
  return next;
}

export function macroDiff(before: MealTemplateItem, after: MealTemplateItem) {
  return {
    calories: Math.round((after.calories - before.calories) * 10) / 10,
    protein_g: Math.round((after.protein_g - before.protein_g) * 10) / 10,
    carbs_g: Math.round((after.carbs_g - before.carbs_g) * 10) / 10,
    fat_g: Math.round((after.fat_g - before.fat_g) * 10) / 10
  };
}
