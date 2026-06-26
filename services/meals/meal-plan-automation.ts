"use client";

import type { MealPlanItem } from "@/types";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";

export type ShoppingListItem = {
  key: string;
  food_name: string;
  category: string;
  quantity: number | null;
  serving_size: string | null;
  count: number;
  checked: boolean;
};

const shoppingPrefix = "plaivra-shopping-checks";

function storageKey(prefix: string, userId: string | null | undefined) {
  return `${prefix}:${userId || "anonymous"}`;
}

function canStore() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function canUseUserData(userId: string | null | undefined): userId is string {
  return Boolean(supabase && userId && isUuid(userId));
}

function readJson<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback;
  try {
    const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(key.replace("plaivra-", "fitlife-"));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canStore()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.localStorage.removeItem(key.replace("plaivra-", "fitlife-"));
}

const migratedShoppingKeys = new Set<string>();

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
  if (!canUseUserData(userId)) return readJson<string[]>(key, []);

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
  if (!canUseUserData(userId)) {
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
