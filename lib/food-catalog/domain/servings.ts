export type FoodServingOption = {
  foodId: string;
  label: string;
  amount: number;
  unitCode: string;
  gramWeight: number | null;
  sourceRecordId: string | null;
  sourcePortionCode: string | null;
  evidenceClass: "exact_source" | "source_estimated";
  sourcePrimary: boolean;
};

export function validateFoodServingOption(value: FoodServingOption): FoodServingOption {
  if (!value.foodId.trim()) throw new Error("Food serving food ID must be nonblank.");
  if (!value.label.trim()) throw new Error("Food serving label must be nonblank.");
  if (!Number.isFinite(value.amount) || value.amount <= 0) {
    throw new Error("Food serving amount must be finite and positive.");
  }
  if (!value.unitCode.trim()) throw new Error("Food serving unit code must be nonblank.");
  if (value.gramWeight !== null && (!Number.isFinite(value.gramWeight) || value.gramWeight <= 0)) {
    throw new Error("Food serving gram weight must be finite and positive when known.");
  }
  if (value.gramWeight === null && value.unitCode !== "g" && value.unitCode !== "ml") {
    throw new Error("Food serving household units require an exact Food gram weight.");
  }
  if (
    value.unitCode !== "g"
    && value.unitCode !== "ml"
    && (value.sourceRecordId === null || !value.sourceRecordId.trim())
  ) {
    throw new Error("Food serving household conversions require source-backed provenance.");
  }
  if (value.evidenceClass !== "exact_source" && value.evidenceClass !== "source_estimated") {
    throw new Error("Food serving evidence class is not approved.");
  }
  return value;
}
