import type { SupabaseClient } from "@supabase/supabase-js";

import type { TodayShoppingItemProjection, TodayShoppingProjection } from "@/lib/dashboard/today-projection-contract";
import {
  deriveShoppingNeeds,
  mutateMealPlanWeek,
  type MealPlanWeekRow,
  type PlannedOccurrenceRow,
  type ShoppingNeed,
} from "@/services/nutrition-v1/server/meal-plan";

export type ShoppingState = "Needed" | "Purchased" | "Don't need";
export type ShoppingManualItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  state: ShoppingState;
  notes: string;
};
export type ShoppingDerivedEdit = { quantity: number | null; notes: string };
export type ShoppingOverride = {
  states: Record<string, ShoppingState>;
  manualItems: ShoppingManualItem[];
  derivedEdits: Record<string, ShoppingDerivedEdit>;
};

type WeekIdentity = Pick<MealPlanWeekRow, "id" | "user_id" | "week_start_date" | "revision" | "week_override_json">;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function shift(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeState(value: unknown): ShoppingState {
  return value === "Purchased" || value === "Don't need" ? value : "Needed";
}

export function shoppingNeedKey(need: ShoppingNeed) {
  return `${need.foodId}|${need.unit}|${need.qualifier ?? ""}`;
}

export function shoppingFromWeekOverride(weekOverride: Record<string, unknown> | null | undefined): ShoppingOverride {
  const shopping = object(object(weekOverride).shopping);
  const rawStates = object(shopping.states);
  const states = Object.fromEntries(
    Object.entries(rawStates).map(([key, value]) => [key, normalizeState(value)]),
  );
  const rawEdits = object(shopping.derivedEdits);
  const derivedEdits = Object.fromEntries(
    Object.entries(rawEdits).map(([key, value]) => {
      const edit = object(value);
      const rawQuantity = edit.quantity;
      const quantity = rawQuantity === null || rawQuantity === undefined ? null : Number(rawQuantity);
      return [key, {
        quantity: quantity !== null && Number.isFinite(quantity) && quantity >= 0 ? quantity : null,
        notes: typeof edit.notes === "string" ? edit.notes : "",
      } satisfies ShoppingDerivedEdit];
    }),
  );
  const manualItems = Array.isArray(shopping.manualItems)
    ? shopping.manualItems.flatMap((raw): ShoppingManualItem[] => {
        const item = object(raw);
        const id = typeof item.id === "string" ? item.id.trim() : "";
        const name = typeof item.name === "string" ? item.name.trim() : "";
        const quantity = Number(item.quantity);
        if (!id || !name || !Number.isFinite(quantity) || quantity < 0) return [];
        return [{
          id,
          name,
          quantity,
          unit: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : "item",
          state: normalizeState(item.state),
          notes: typeof item.notes === "string" ? item.notes : "",
        }];
      })
    : [];
  return { states, manualItems, derivedEdits };
}

function excludedOccurrenceIds(weekOverride: Record<string, unknown> | null | undefined) {
  const raw = object(weekOverride).shoppingExcludedOccurrenceIds;
  return new Set(
    Array.isArray(raw)
      ? raw.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
  );
}

function derivedProjection(
  weekStart: string,
  need: ShoppingNeed,
  override: ShoppingOverride,
): TodayShoppingItemProjection | null {
  const key = shoppingNeedKey(need);
  const state = override.states[key] ?? "Needed";
  if (state === "Don't need") return null;
  const edit = override.derivedEdits[key];
  return {
    id: `derived:${key}`,
    weekStart,
    itemName: need.name,
    quantity: edit?.quantity ?? need.quantity,
    unit: need.unit,
    storeSection: "Other",
    checked: state === "Purchased",
    alreadyHave: false,
  };
}

function manualProjection(weekStart: string, item: ShoppingManualItem): TodayShoppingItemProjection | null {
  if (item.state === "Don't need") return null;
  return {
    id: `manual:${item.id}`,
    weekStart,
    itemName: item.name,
    quantity: item.quantity,
    unit: item.unit,
    storeSection: "Other",
    checked: item.state === "Purchased",
    alreadyHave: false,
  };
}

async function containingWeek(supabase: SupabaseClient, userId: string, date: string) {
  const result = await supabase
    .from("nutrition_meal_plan_weeks")
    .select("id,user_id,week_start_date,revision,week_override_json")
    .eq("user_id", userId)
    .lte("week_start_date", date)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  const week = result.data as unknown as WeekIdentity | null;
  if (!week || date > shift(week.week_start_date, 6)) return null;
  return week;
}

async function weekShopping(
  supabase: SupabaseClient,
  userId: string,
  week: WeekIdentity,
) {
  const result = await supabase
    .from("nutrition_planned_occurrences")
    .select("id,week_id,user_id,source_type,frozen_snapshot,status")
    .eq("week_id", week.id)
    .eq("user_id", userId)
    .order("plan_date", { ascending: true })
    .order("position", { ascending: true });
  if (result.error) throw result.error;
  const excluded = excludedOccurrenceIds(week.week_override_json);
  const occurrences = (result.data ?? []) as unknown as PlannedOccurrenceRow[];
  const needs = deriveShoppingNeeds(
    occurrences
      .filter((row) => !excluded.has(row.id))
      .map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        frozenSnapshot: row.frozen_snapshot,
      })),
  );
  return { needs, override: shoppingFromWeekOverride(week.week_override_json) };
}

export async function readTodayV1ShoppingProjection(input: {
  supabase: SupabaseClient;
  userId: string;
  date: string;
}): Promise<TodayShoppingProjection> {
  const week = await containingWeek(input.supabase, input.userId, input.date);
  if (!week) return { items: [], itemCount: 0 };
  const { needs, override } = await weekShopping(input.supabase, input.userId, week);
  const items = [
    ...needs.map((need) => derivedProjection(week.week_start_date, need, override)),
    ...override.manualItems.map((item) => manualProjection(week.week_start_date, item)),
  ].filter((item): item is TodayShoppingItemProjection => item !== null);
  return { items, itemCount: items.length };
}

export async function setTodayShoppingItemState(
  supabase: SupabaseClient,
  userId: string,
  input: {
    weekStartDate: string;
    itemId: string;
    state: Exclude<ShoppingState, "Don't need">;
    operationId: string;
  },
) {
  const weekResult = await supabase
    .from("nutrition_meal_plan_weeks")
    .select("id,user_id,week_start_date,revision,week_override_json")
    .eq("user_id", userId)
    .eq("week_start_date", input.weekStartDate)
    .maybeSingle();
  if (weekResult.error) throw weekResult.error;
  const week = weekResult.data as unknown as WeekIdentity | null;
  if (!week) throw new Error("Meal Plan week was not found.");

  const { needs, override } = await weekShopping(supabase, userId, week);
  let item: TodayShoppingItemProjection | null = null;
  const nextOverride: ShoppingOverride = {
    states: { ...override.states },
    derivedEdits: { ...override.derivedEdits },
    manualItems: override.manualItems.map((manual) => ({ ...manual })),
  };

  if (input.itemId.startsWith("derived:")) {
    const key = input.itemId.slice("derived:".length);
    const need = needs.find((candidate) => shoppingNeedKey(candidate) === key);
    if (!need) throw new Error("Shopping item is no longer part of this Meal Plan week.");
    nextOverride.states[key] = input.state;
    item = derivedProjection(week.week_start_date, need, nextOverride);
  } else if (input.itemId.startsWith("manual:")) {
    const manualId = input.itemId.slice("manual:".length);
    const manual = nextOverride.manualItems.find((candidate) => candidate.id === manualId);
    if (!manual) throw new Error("Manual Shopping item was not found.");
    manual.state = input.state;
    item = manualProjection(week.week_start_date, manual);
  } else {
    throw new Error("Shopping item identity is invalid.");
  }
  if (!item) throw new Error("Shopping item state could not be projected.");

  await mutateMealPlanWeek(supabase, userId, {
    weekId: week.id,
    weekStartDate: week.week_start_date,
    baseRevision: Number(week.revision),
    operationId: input.operationId,
    mutation: {
      weekOverride: {
        ...week.week_override_json,
        shopping: nextOverride,
      },
    },
  });
  return { item };
}
