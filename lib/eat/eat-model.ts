import type { DailyNutritionSummary, FoodItem, FoodLog, MealPlanItem, MealType } from "@/types";

export type EatView = "day" | "week";
export type SourceState<T> =
  | { status: "loading"; data?: T }
  | { status: "loaded"; data: T }
  | { status: "failed"; data?: T; error: string };

export type EatMealGroup = "Breakfast" | "Lunch" | "Dinner" | "Snack" | "Other";
export const EAT_MEAL_GROUPS: EatMealGroup[] = ["Breakfast", "Lunch", "Dinner", "Snack", "Other"];
export const EDITABLE_MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

export type NutritionMetricKey = "calories" | "protein_g" | "carbs_g" | "fat_g";
export type NutritionProgressState = "unavailable" | "no-target" | "below" | "near" | "over" | "materially-over";

export type NutritionMetric = {
  key: NutritionMetricKey;
  consumed: number | null;
  target: number | null;
  remaining: number | null;
  percent: number | null;
  state: NutritionProgressState;
};

export type RepeatFoodOption = FoodLog & {
  repeatKey: string;
  usageCount: number;
  lastUsedAt: number;
  isFavorite: boolean;
  score: number;
};

export type WeekNutritionAnalytics = {
  loggedDays: number;
  coverageLabel: "empty" | "partial" | "complete";
  averageCaloriesLoggedDays: number | null;
  averageProteinLoggedDays: number | null;
  calendarAverageCalories: number | null;
  adherenceDays: number | null;
  proteinCalories: number;
  carbCalories: number;
  fatCalories: number;
  macroCaloriesTotal: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toLocaleDateString("en-CA") === value;
}

export function parseEatView(value: string | null | undefined): EatView {
  return value === "week" ? "week" : "day";
}

export function parseEatDate(value: string | null | undefined, fallback: string) {
  return isValidIsoDate(value) ? value : fallback;
}

export function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
}

export function startOfEatWeek(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date.toLocaleDateString("en-CA");
}

export function normalizeMealGroup(value: string | null | undefined): EatMealGroup {
  const clean = String(value ?? "").trim().toLowerCase();
  if (clean === "breakfast") return "Breakfast";
  if (clean === "lunch") return "Lunch";
  if (clean === "dinner") return "Dinner";
  if (clean === "snack" || clean === "snacks") return "Snack";
  return "Other";
}

export function normalizeEditableMealType(value: string | null | undefined, fallback: MealType = "Lunch"): MealType {
  const group = normalizeMealGroup(value);
  return group === "Other" ? fallback : group;
}

export function groupFoodLogs(logs: FoodLog[]) {
  const grouped: Record<EatMealGroup, FoodLog[]> = {
    Breakfast: [], Lunch: [], Dinner: [], Snack: [], Other: []
  };
  logs.forEach((log) => grouped[normalizeMealGroup(log.meal_type)].push(log));
  return grouped;
}

export function suggestMealType(selectedDate: string, today: string, hour: number): MealType {
  if (selectedDate !== today) return "Lunch";
  if (hour < 10) return "Breakfast";
  if (hour < 15) return "Lunch";
  if (hour < 18) return "Snack";
  return "Dinner";
}

function mealPeriodRank(mealType: string, hour: number) {
  const group = normalizeMealGroup(mealType);
  const current = hour < 10 ? "Breakfast" : hour < 15 ? "Lunch" : hour < 18 ? "Snack" : "Dinner";
  const order: EatMealGroup[] = ["Breakfast", "Lunch", "Snack", "Dinner", "Other"];
  const currentIndex = order.indexOf(current);
  const itemIndex = order.indexOf(group);
  return itemIndex >= currentIndex ? itemIndex - currentIndex : 10 + itemIndex;
}

export function selectNextPlannedMeal(items: MealPlanItem[], selectedDate: string, today: string, hour: number) {
  const eligible = items.filter((item) => item.plan_date === selectedDate && item.status === "planned" && !item.food_log_id);
  if (!eligible.length) return null;
  if (selectedDate !== today) return eligible[0] ?? null;
  return eligible.slice().sort((a, b) => mealPeriodRank(a.meal_type, hour) - mealPeriodRank(b.meal_type, hour) || a.created_at.localeCompare(b.created_at))[0] ?? null;
}

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sumEatLogs(logs: FoodLog[]) {
  return logs.reduce((total, log) => ({
    calories: total.calories + finite(log.calories),
    protein_g: Math.round((total.protein_g + finite(log.protein_g)) * 10) / 10,
    carbs_g: Math.round((total.carbs_g + finite(log.carbs_g)) * 10) / 10,
    fat_g: Math.round((total.fat_g + finite(log.fat_g)) * 10) / 10
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

export function progressState(consumed: number | null, target: number | null, tolerance = 0.05): NutritionProgressState {
  if (consumed === null) return "unavailable";
  if (target === null || target <= 0) return "no-target";
  const ratio = consumed / target;
  if (ratio < 1 - tolerance) return "below";
  if (ratio <= 1 + tolerance) return "near";
  if (ratio <= 1 + tolerance * 3) return "over";
  return "materially-over";
}

export function buildNutritionMetrics({
  consumed,
  targets,
  logsAvailable,
  targetsAvailable,
  tolerance = 0.05
}: {
  consumed: ReturnType<typeof sumEatLogs>;
  targets: { daily_calories: number; protein_g: number; carbs_g: number; fat_g: number } | null;
  logsAvailable: boolean;
  targetsAvailable: boolean;
  tolerance?: number;
}): NutritionMetric[] {
  const definitions: Array<[NutritionMetricKey, number]> = [
    ["calories", consumed.calories], ["protein_g", consumed.protein_g], ["carbs_g", consumed.carbs_g], ["fat_g", consumed.fat_g]
  ];
  return definitions.map(([key, value]) => {
    const targetKey = key === "calories" ? "daily_calories" : key;
    const consumedValue = logsAvailable ? value : null;
    const targetValue = targetsAvailable && targets ? finite(targets[targetKey]) || null : null;
    const remaining = consumedValue !== null && targetValue !== null ? Math.round((targetValue - consumedValue) * 10) / 10 : null;
    const percent = consumedValue !== null && targetValue !== null ? Math.max(0, Math.round((consumedValue / targetValue) * 1000) / 10) : null;
    return { key, consumed: consumedValue, target: targetValue, remaining, percent, state: progressState(consumedValue, targetValue, tolerance) };
  });
}

export function repeatKey(log: Pick<FoodLog, "food_item_id" | "user_food_item_id" | "food_name" | "serving_size">) {
  return log.food_item_id || log.user_food_item_id || `${log.food_name}|${log.serving_size}`.toLowerCase();
}

export function rankRepeatFoods(logs: FoodLog[], favoriteKeys: string[], limit = 6): RepeatFoodOption[] {
  const favorites = new Set(favoriteKeys);
  const map = new Map<string, RepeatFoodOption>();
  logs.forEach((log, index) => {
    const key = repeatKey(log);
    const current = map.get(key);
    const lastUsedAt = Math.max(0, logs.length - index);
    if (current) {
      current.usageCount += 1;
      current.lastUsedAt = Math.max(current.lastUsedAt, lastUsedAt);
    } else {
      map.set(key, { ...log, repeatKey: key, usageCount: 1, lastUsedAt, isFavorite: favorites.has(key), score: 0 });
    }
  });
  return Array.from(map.values())
    .map((item) => ({ ...item, score: item.usageCount * 8 + item.lastUsedAt + (item.isFavorite ? 30 : 0) }))
    .sort((a, b) => b.score - a.score || a.food_name.localeCompare(b.food_name))
    .slice(0, limit);
}

export function storedServingLabel(food: Pick<FoodItem, "serving_size">) {
  return food.serving_size?.trim() || "1 serving";
}

export function supportedServingOptions(food: Pick<FoodItem, "serving_size">) {
  return [{ id: "stored", label: storedServingLabel(food), multiplier: 1, approximate: false }] as const;
}

export function foodLogDuplicateKey(log: Pick<FoodLog, "food_name" | "serving_size" | "quantity" | "meal_type">) {
  return [log.food_name.trim().toLowerCase(), log.serving_size.trim().toLowerCase(), finite(log.quantity), normalizeMealGroup(log.meal_type)].join("|");
}

export function findCopyDuplicates(source: FoodLog[], target: FoodLog[]) {
  const existing = new Set(target.map(foodLogDuplicateKey));
  return source.filter((item) => existing.has(foodLogDuplicateKey(item))).map((item) => item.id);
}

export function buildWeekAnalytics(days: DailyNutritionSummary[], targetCalories: number | null, tolerance = 0.05): WeekNutritionAnalytics {
  const logged = days.filter((day) => day.logs.length > 0);
  const calories = logged.reduce((sum, day) => sum + finite(day.calories), 0);
  const protein = logged.reduce((sum, day) => sum + finite(day.protein_g), 0);
  const proteinCalories = logged.reduce((sum, day) => sum + finite(day.protein_g) * 4, 0);
  const carbCalories = logged.reduce((sum, day) => sum + finite(day.carbs_g) * 4, 0);
  const fatCalories = logged.reduce((sum, day) => sum + finite(day.fat_g) * 9, 0);
  const adherenceDays = targetCalories && targetCalories > 0 && logged.length
    ? logged.filter((day) => Math.abs(finite(day.calories) - targetCalories) / targetCalories <= tolerance).length
    : null;
  return {
    loggedDays: logged.length,
    coverageLabel: logged.length === 0 ? "empty" : logged.length === 7 ? "complete" : "partial",
    averageCaloriesLoggedDays: logged.length ? Math.round(calories / logged.length) : null,
    averageProteinLoggedDays: logged.length ? Math.round((protein / logged.length) * 10) / 10 : null,
    calendarAverageCalories: logged.length ? Math.round(calories / 7) : null,
    adherenceDays,
    proteinCalories: Math.round(proteinCalories),
    carbCalories: Math.round(carbCalories),
    fatCalories: Math.round(fatCalories),
    macroCaloriesTotal: Math.round(proteinCalories + carbCalories + fatCalories)
  };
}
