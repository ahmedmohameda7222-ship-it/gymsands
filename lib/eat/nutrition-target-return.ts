export type NutritionTargetsReturnDestination =
  | { kind: "default-eat" }
  | { kind: "custom"; href: string };

export function safeCustomNutritionTargetsReturnHref(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export function parseNutritionTargetsReturnDestination(value: string | null | undefined): NutritionTargetsReturnDestination {
  const href = safeCustomNutritionTargetsReturnHref(value);
  return href ? { kind: "custom", href } : { kind: "default-eat" };
}

export function resolveNutritionTargetsReturnHref(destination: NutritionTargetsReturnDestination, selectedDate: string) {
  return destination.kind === "custom"
    ? destination.href
    : `/calories?date=${encodeURIComponent(selectedDate)}&view=day`;
}

export function buildNutritionTargetsDateHref(date: string, destination: NutritionTargetsReturnDestination) {
  const params = new URLSearchParams({ date });
  if (destination.kind === "custom") params.set("return", destination.href);
  return `/settings/nutrition-targets?${params.toString()}`;
}
