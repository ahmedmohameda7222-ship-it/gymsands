import { isIsoDate } from "@/lib/date-utils";

export type NutritionTargetValues = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_ml: number | null;
};

export type NutritionTargetPeriod = NutritionTargetValues & {
  id: string;
  effective_from: string;
  effective_to: string | null;
  source: string;
  source_evidence: Record<string, unknown>;
};

export type EffectiveNutritionTarget = {
  available: boolean;
  effective_from: string | null;
  effective_to: string | null;
  values: NutritionTargetValues | null;
  source: string | null;
  source_evidence: Record<string, unknown> | null;
  reason: "effective_target" | "target_unavailable_for_date";
};

function requireDate(value: string, field: string) {
  if (!isIsoDate(value)) throw new Error(`${field} must use YYYY-MM-DD.`);
  return value;
}

function nullableNonNegative(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative finite number or null.`);
  }
  return parsed;
}

function requiredText(value: unknown, field: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function evidenceObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function normalizeNutritionTargetPeriod(row: Record<string, unknown>): NutritionTargetPeriod {
  const effectiveFrom = requireDate(String(row.effective_from ?? ""), "Target effective-from date");
  const effectiveTo = row.effective_to === null || row.effective_to === undefined
    ? null
    : requireDate(String(row.effective_to), "Target effective-to date");
  if (effectiveTo !== null && effectiveTo <= effectiveFrom) {
    throw new Error("Target effective-to date must be after effective-from date.");
  }
  return {
    id: requiredText(row.id, "Target period ID"),
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    calories: nullableNonNegative(row.calories, "Calories"),
    protein_g: nullableNonNegative(row.protein_g, "Protein"),
    carbs_g: nullableNonNegative(row.carbs_g, "Carbohydrates"),
    fat_g: nullableNonNegative(row.fat_g, "Fat"),
    water_ml: nullableNonNegative(row.water_ml, "Water"),
    source: requiredText(row.source, "Target source"),
    source_evidence: evidenceObject(row.source_evidence),
  };
}

function unavailableTarget(): EffectiveNutritionTarget {
  return {
    available: false,
    effective_from: null,
    effective_to: null,
    values: null,
    source: null,
    source_evidence: null,
    reason: "target_unavailable_for_date",
  };
}

export function resolveEffectiveNutritionTarget(
  periods: readonly NutritionTargetPeriod[],
  date: string,
): EffectiveNutritionTarget {
  requireDate(date, "Target date");
  const matches = periods.filter((period) =>
    period.effective_from <= date && (period.effective_to === null || date < period.effective_to),
  );
  if (matches.length > 1) {
    throw new Error(`Overlapping Nutrition target periods exist for ${date}.`);
  }
  const period = matches[0];
  if (!period) return unavailableTarget();
  return {
    available: true,
    effective_from: period.effective_from,
    effective_to: period.effective_to,
    values: {
      calories: period.calories,
      protein_g: period.protein_g,
      carbs_g: period.carbs_g,
      fat_g: period.fat_g,
      water_ml: period.water_ml,
    },
    source: period.source,
    source_evidence: { ...period.source_evidence },
    reason: "effective_target",
  };
}

export function buildLegacyCutoverTargetPeriod({
  effectiveFrom,
  values,
  evidence,
}: {
  effectiveFrom: string;
  values: NutritionTargetValues;
  evidence?: Record<string, unknown>;
}): NutritionTargetPeriod {
  const effectiveFromDate = requireDate(effectiveFrom, "Legacy cutover date");
  const normalizedValues: NutritionTargetValues = {
    calories: nullableNonNegative(values.calories, "Calories"),
    protein_g: nullableNonNegative(values.protein_g, "Protein"),
    carbs_g: nullableNonNegative(values.carbs_g, "Carbohydrates"),
    fat_g: nullableNonNegative(values.fat_g, "Fat"),
    water_ml: nullableNonNegative(values.water_ml, "Water"),
  };
  if (Object.values(normalizedValues).every((value) => value === null)) {
    throw new Error("A legacy cutover target requires at least one known target value.");
  }
  return {
    id: `legacy-cutover:${effectiveFromDate}`,
    effective_from: effectiveFromDate,
    effective_to: null,
    ...normalizedValues,
    source: "legacy_cutover",
    source_evidence: {
      authority: "legacy_current_state",
      ...evidenceObject(evidence),
    },
  };
}

export function targetPeriodInsertPayload(
  userId: string,
  period: NutritionTargetPeriod,
) {
  const owner = requiredText(userId, "Target owner");
  return {
    user_id: owner,
    effective_from: period.effective_from,
    effective_to: period.effective_to,
    calories: period.calories,
    protein_g: period.protein_g,
    carbs_g: period.carbs_g,
    fat_g: period.fat_g,
    water_ml: period.water_ml,
    source: period.source,
    source_evidence: period.source_evidence,
  };
}
