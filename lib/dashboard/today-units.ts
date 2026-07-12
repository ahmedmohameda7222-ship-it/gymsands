import type { UserAppSettings } from "@/services/database/user-settings";

export function energyValue(kcal: number, unit: UserAppSettings["energyUnit"]) {
  return unit === "kJ" ? Math.round(kcal * 4.184) : Math.round(kcal);
}

export function formatEnergy(kcal: number, unit: UserAppSettings["energyUnit"]) {
  return `${energyValue(kcal, unit)} ${unit}`;
}

export function liquidValue(ml: number, unit: UserAppSettings["liquidUnit"]) {
  return unit === "oz" ? Math.round((ml / 29.5735295625) * 10) / 10 : Math.round(ml);
}

export function formatLiquid(ml: number, unit: UserAppSettings["liquidUnit"]) {
  return `${liquidValue(ml, unit)} ${unit}`;
}

export function formatWeight(kg: number, unit: UserAppSettings["weightUnit"]) {
  const value = unit === "lb" ? Math.round(kg * 2.2046226218 * 10) / 10 : Math.round(kg * 10) / 10;
  return `${value} ${unit}`;
}
