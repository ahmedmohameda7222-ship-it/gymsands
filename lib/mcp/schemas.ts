export type JsonObject = Record<string, unknown>;

export const mealTypes = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
export type MealType = (typeof mealTypes)[number];

export function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function getString(input: JsonObject, key: string, fallback = "") {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function getOptionalString(input: JsonObject, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function getNumber(input: JsonObject, key: string, fallback = 0) {
  const value = input[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOptionalNumber(input: JsonObject, key: string) {
  const value = input[key];
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getBoolean(input: JsonObject, key: string, fallback = false) {
  const value = input[key];
  return typeof value === "boolean" ? value : fallback;
}

export function getArray<T = unknown>(input: JsonObject, key: string): T[] {
  const value = input[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function cleanDate(value: unknown) {
  if (value === "today" || value === undefined || value === null || value === "") {
    return new Date().toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("Date must be ISO YYYY-MM-DD or today.");
  return parsed.toISOString().slice(0, 10);
}

export function cleanMealType(value: unknown): MealType {
  if (typeof value === "string") {
    const exact = mealTypes.find((mealType) => mealType.toLowerCase() === value.toLowerCase());
    if (exact) return exact;
  }
  throw new Error("meal_type must be Breakfast, Lunch, Dinner, or Snack.");
}

export function requireConfirmation(input: JsonObject) {
  if (input.confirm !== true) {
    return {
      requires_confirmation: true,
      message: "This is a high-risk FitLife action. Ask the user for explicit confirmation, then call again with confirm: true."
    };
  }
  return null;
}

export const emptyInputSchema = { type: "object", properties: {}, additionalProperties: false };
