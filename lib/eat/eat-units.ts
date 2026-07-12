import type { UserAppSettings } from "@/services/database/user-settings";

const KJ_PER_KCAL = 4.184;
const ML_PER_FL_OZ = 29.5735295625;
const LB_PER_KG = 2.2046226218;
const CM_PER_INCH = 2.54;

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number, locale: string, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function eatEnergyDisplayValue(kcal: number, unit: UserAppSettings["energyUnit"]) {
  return unit === "kJ" ? rounded(finite(kcal) * KJ_PER_KCAL, 1) : rounded(finite(kcal), 1);
}

export function eatEnergyInputToKcal(value: number | string, unit: UserAppSettings["energyUnit"]) {
  const displayValue = finite(value);
  return unit === "kJ" ? rounded(displayValue / KJ_PER_KCAL, 4) : displayValue;
}

export function formatEatEnergy(kcal: number, unit: UserAppSettings["energyUnit"], locale = "en-GB") {
  return `${formatNumber(eatEnergyDisplayValue(kcal, unit), locale)} ${unit}`;
}

export function eatLiquidDisplayValue(ml: number, unit: UserAppSettings["liquidUnit"]) {
  return unit === "oz" ? rounded(finite(ml) / ML_PER_FL_OZ, 1) : rounded(finite(ml), 0);
}

export function eatLiquidInputToMl(value: number | string, unit: UserAppSettings["liquidUnit"]) {
  const displayValue = finite(value);
  return unit === "oz" ? rounded(displayValue * ML_PER_FL_OZ, 0) : rounded(displayValue, 0);
}

export function formatEatLiquid(ml: number, unit: UserAppSettings["liquidUnit"], locale = "en-GB") {
  const canonical = finite(ml);
  if (unit === "oz") return `${formatNumber(eatLiquidDisplayValue(canonical, unit), locale)} oz`;
  if (Math.abs(canonical) >= 1000) return `${formatNumber(rounded(canonical / 1000, 2), locale, 2)} L`;
  return `${formatNumber(rounded(canonical, 0), locale, 0)} ml`;
}

export function eatWeightDisplayValue(kg: number, unit: UserAppSettings["weightUnit"]) {
  return unit === "lb" ? rounded(finite(kg) * LB_PER_KG, 1) : rounded(finite(kg), 1);
}

export function eatWeightInputToKg(value: number | string, unit: UserAppSettings["weightUnit"]) {
  const displayValue = finite(value);
  return unit === "lb" ? rounded(displayValue / LB_PER_KG, 4) : displayValue;
}

export function formatEatWeight(kg: number, unit: UserAppSettings["weightUnit"], locale = "en-GB") {
  return `${formatNumber(eatWeightDisplayValue(kg, unit), locale)} ${unit}`;
}

export type EatHeightDisplay = {
  cm: number;
  feet: number;
  inches: number;
};

export function eatHeightDisplayValue(cm: number): EatHeightDisplay {
  const canonical = Math.max(0, finite(cm));
  const totalInches = canonical / CM_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  const inches = rounded(totalInches - feet * 12, 1);
  return { cm: rounded(canonical, 1), feet, inches };
}

export function eatHeightInputToCm({ cm, feet, inches, unit }: {
  cm?: number | string;
  feet?: number | string;
  inches?: number | string;
  unit: UserAppSettings["heightUnit"];
}) {
  if (unit === "cm") return rounded(finite(cm), 1);
  return rounded((Math.max(0, finite(feet)) * 12 + Math.max(0, finite(inches))) * CM_PER_INCH, 1);
}

export function formatEatHeight(cm: number, unit: UserAppSettings["heightUnit"], locale = "en-GB") {
  const display = eatHeightDisplayValue(cm);
  return unit === "cm"
    ? `${formatNumber(display.cm, locale)} cm`
    : `${display.feet} ft ${formatNumber(display.inches, locale)} in`;
}
