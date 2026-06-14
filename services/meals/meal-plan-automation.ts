"use client";

import type { MealPlanItem, MealType } from "@/types";
import { supabase } from "@/lib/supabase/client";

export type MealTemplateItem = {
  food_name: string;
  meal_type: MealType;
  serving_size: string | null;
  quantity: number | null;
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
  serving_size: string | null;
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

let hasMigratedTemplates = false;
let hasMigratedBatch = false;
const migratedShoppingKeys = new Set<string>();

export async function getMealTemplates(userId: string | null | undefined): Promise<MealTemplate[]> {
  if (!userId) return readJson<MealTemplate[]>(storageKey(templatePrefix, userId), []);
  
  if (!hasMigratedTemplates && canStore()) {
    hasMigratedTemplates = true;
    const local = readJson<MealTemplate[]>(storageKey(templatePrefix, userId), []);
    if (local.length > 0) {
      for (const t of local) {
        const { data: inserted, error } = await supabase!.from("meal_templates").insert({
          user_id: userId,
          name: t.name,
          notes: t.notes,
          created_at: t.created_at
        }).select().single();
        
        if (inserted && !error) {
          await supabase!.from("meal_template_items").insert(
            t.items.map(item => ({
              template_id: inserted.id,
              user_id: userId,
              food_name: item.food_name,
              meal_type: item.meal_type,
              serving_size: item.serving_size,
              quantity: item.quantity,
              calories: item.calories,
              protein_g: item.protein_g,
              carbs_g: item.carbs_g,
              fat_g: item.fat_g,
              notes: item.notes
            }))
          );
        }
      }
      window.localStorage.removeItem(storageKey(templatePrefix, userId));
    }
  }

  const { data: templatesData } = await supabase!.from("meal_templates").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (!templatesData) return [];

  const { data: itemsData } = await supabase!.from("meal_template_items").select("*").in("template_id", templatesData.map((t: Record<string, unknown>) => t.id));
  
  return templatesData.map((t: Record<string, unknown>) => ({
    ...t,
    items: (itemsData || []).filter((i: Record<string, unknown>) => i.template_id === t.id).map(i => ({
      food_name: i.food_name,
      meal_type: i.meal_type,
      serving_size: i.serving_size,
      quantity: i.quantity,
      calories: i.calories,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
      notes: i.notes
    }))
  })) as MealTemplate[];
}

export async function saveMealTemplate(userId: string | null | undefined, name: string, items: MealTemplateItem[], notes?: string | null): Promise<MealTemplate> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Template name is required.");
  if (!items.length) throw new Error("Template must include at least one planned food.");
  
  const created_at = new Date().toISOString();

  if (!userId) {
    const template: MealTemplate = {
      id: `template-${crypto.randomUUID()}`,
      user_id: "anonymous",
      name: cleanName,
      items,
      notes: notes?.trim() || null,
      created_at
    };
    const key = storageKey(templatePrefix, userId);
    writeJson(key, [template, ...readJson<MealTemplate[]>(key, [])]);
    return template;
  }

    const { data: templateData, error: templateError } = await supabase!.from("meal_templates").insert({
    user_id: userId,
    name: cleanName,
    notes: notes?.trim() || null,
    created_at
  }).select().single();

  if (templateError) throw new Error(templateError.message);

  const { data: itemsData, error: itemsError } = await supabase!.from("meal_template_items").insert(
    items.map(item => ({
      template_id: templateData.id,
      user_id: userId,
      ...item
    }))
  ).select();

  if (itemsError) throw new Error(itemsError.message);

  return {
    ...templateData,
    items: itemsData.map((i: Record<string, unknown>) => ({
      food_name: i.food_name,
      meal_type: i.meal_type,
      serving_size: i.serving_size,
      quantity: i.quantity,
      calories: i.calories,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
      notes: i.notes
    }))
  } as MealTemplate;
}

export async function deleteMealTemplate(userId: string | null | undefined, templateId: string) {
  if (!userId) {
    const key = storageKey(templatePrefix, userId);
    writeJson(key, readJson<MealTemplate[]>(key, []).filter((template) => template.id !== templateId));
    return;
  }
    await supabase!.from("meal_templates").delete().match({ id: templateId, user_id: userId });
}

export async function getBatchMeals(userId: string | null | undefined): Promise<BatchMeal[]> {
  if (!userId) return readJson<BatchMeal[]>(storageKey(batchPrefix, userId), []);
  
  if (!hasMigratedBatch && canStore()) {
    hasMigratedBatch = true;
    const local = readJson<BatchMeal[]>(storageKey(batchPrefix, userId), []);
    if (local.length > 0) {
      for (const b of local) {
        await supabase!.from("batch_meals").insert({
          user_id: userId,
          name: b.name,
          portions: b.portions,
          serving_size: b.serving_size,
          notes: b.notes,
          total_calories: b.total_calories,
          total_protein_g: b.total_protein_g,
          total_carbs_g: b.total_carbs_g,
          total_fat_g: b.total_fat_g,
          created_at: b.created_at,
          updated_at: b.created_at
        });
      }
      window.localStorage.removeItem(storageKey(batchPrefix, userId));
    }
  }

  const { data } = await supabase!.from("batch_meals").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return (data || []) as BatchMeal[];
}

export async function saveBatchMeal(userId: string | null | undefined, input: Omit<BatchMeal, "id" | "user_id" | "created_at">): Promise<BatchMeal> {
  const name = input.name.trim();
  if (!name) throw new Error("Batch meal name is required.");
  const portions = Math.max(1, Math.round(toNumber(input.portions)));
  
  if (!userId) {
    const batch: BatchMeal = {
      id: `batch-${crypto.randomUUID()}`,
      user_id: "anonymous",
      name,
      portions,
      serving_size: input.serving_size?.trim() || "1 portion",
      notes: input.notes?.trim() || null,
      total_calories: Math.max(0, toNumber(input.total_calories)),
      total_protein_g: Math.max(0, toNumber(input.total_protein_g)),
      total_carbs_g: Math.max(0, toNumber(input.total_carbs_g)),
      total_fat_g: Math.max(0, toNumber(input.total_fat_g)),
      created_at: new Date().toISOString()
    };
    const key = storageKey(batchPrefix, userId);
    writeJson(key, [batch, ...readJson<BatchMeal[]>(key, [])]);
    return batch;
  }

    const { data, error } = await supabase!.from("batch_meals").insert({
    user_id: userId,
    name,
    portions,
    serving_size: input.serving_size?.trim() || "1 portion",
    notes: input.notes?.trim() || null,
    total_calories: Math.max(0, toNumber(input.total_calories)),
    total_protein_g: Math.max(0, toNumber(input.total_protein_g)),
    total_carbs_g: Math.max(0, toNumber(input.total_carbs_g)),
    total_fat_g: Math.max(0, toNumber(input.total_fat_g)),
  }).select().single();

  if (error) throw new Error(error.message);
  return data as BatchMeal;
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

export async function getCheckedShoppingKeys(userId: string | null | undefined, weekStart: string): Promise<string[]> {
  const key = `${storageKey(shoppingPrefix, userId)}:${weekStart}`;
  if (!userId) return readJson<string[]>(key, []);
  
    
  if (!migratedShoppingKeys.has(key) && canStore()) {
    migratedShoppingKeys.add(key);
    const local = readJson<string[]>(key, []);
    if (local.length > 0) {
      await Promise.all(local.map(itemKey => 
        supabase!.from("user_shopping_checks").upsert({ user_id: userId, week_start: weekStart, item_key: itemKey, checked: true }, { onConflict: "user_id, week_start, item_key" })
      ));
      window.localStorage.removeItem(key);
    }
  }

  const { data } = await supabase!.from("user_shopping_checks").select("item_key").match({ user_id: userId, week_start: weekStart, checked: true });
  return data?.map((d: Record<string, unknown>) => d.item_key as string) || [];
}

export async function setShoppingItemChecked(userId: string | null | undefined, weekStart: string, itemKey: string, checked: boolean): Promise<string[]> {
  if (!userId) {
    const storage = `${storageKey(shoppingPrefix, userId)}:${weekStart}`;
    const current = new Set(readJson<string[]>(storage, []));
    if (checked) current.add(itemKey);
    else current.delete(itemKey);
    const next = Array.from(current);
    writeJson(storage, next);
    return next;
  }

    if (checked) {
    await supabase!.from("user_shopping_checks").upsert({ user_id: userId, week_start: weekStart, item_key: itemKey, checked: true }, { onConflict: "user_id, week_start, item_key" });
  } else {
    await supabase!.from("user_shopping_checks").update({ checked: false }).match({ user_id: userId, week_start: weekStart, item_key: itemKey });
  }
  
  return getCheckedShoppingKeys(userId, weekStart);
}

export function macroDiff(before: MealTemplateItem, after: MealTemplateItem) {
  return {
    calories: Math.round((after.calories - before.calories) * 10) / 10,
    protein_g: Math.round((after.protein_g - before.protein_g) * 10) / 10,
    carbs_g: Math.round((after.carbs_g - before.carbs_g) * 10) / 10,
    fat_g: Math.round((after.fat_g - before.fat_g) * 10) / 10
  };
}
