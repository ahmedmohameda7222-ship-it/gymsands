"use client";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { NutritionTargetValues } from "@/lib/nutrition-v1/targets";
import type { PlannedOccurrenceRow } from "@/services/nutrition-v1/server/meal-plan";

type Macro = { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
const empty = (): Macro => ({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function occurrenceNutrition(item: PlannedOccurrenceRow): Macro | null {
  const snapshot = record(item.frozen_snapshot);
  const raw = record(snapshot.frozen_nutrition ?? snapshot.nutrition);
  if (!Object.keys(raw).length) return null;
  return {
    calories: numberOrNull(raw.calories ?? raw.caloriesKcal),
    protein_g: numberOrNull(raw.protein_g ?? raw.proteinG),
    carbs_g: numberOrNull(raw.carbs_g ?? raw.carbsG),
    fat_g: numberOrNull(raw.fat_g ?? raw.fatG),
  };
}

function format(value: number | null, unit: string, locale: string) {
  return value === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round(value * 10) / 10)}${unit}`;
}

export function PlannedNutritionSummary({ occurrences, target }: {
  occurrences: PlannedOccurrenceRow[];
  target: NutritionTargetValues | null;
}) {
  const { nt, language, dir, locale } = useNutritionV1Translation();
  const total = empty();
  let incomplete = 0;
  for (const occurrence of occurrences) {
    if (occurrence.status === "skipped") continue;
    const nutrition = occurrenceNutrition(occurrence);
    if (!nutrition) { incomplete += 1; continue; }
    for (const key of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
      if (nutrition[key] === null) {
        total[key] = null;
      } else if (total[key] !== null) {
        total[key] += nutrition[key] as number;
      }
    }
  }
  const knownCalories = total.calories;
  const difference = target?.calories !== null && target?.calories !== undefined && knownCalories !== null
    ? target.calories - knownCalories
    : null;
  const remainingText = difference === null
    ? (language === "ar" ? "لا توجد مقارنة مكتملة مع الهدف" : language === "de" ? "Kein vollständiger Zielvergleich" : "No complete target comparison")
    : difference >= 0
      ? `${format(difference, " kcal", locale)} ${language === "ar" ? "متبقية" : language === "de" ? "verbleibend" : "remaining"}`
      : `${format(Math.abs(difference), " kcal", locale)} ${language === "ar" ? "فوق الهدف" : language === "de" ? "über dem Ziel" : "over target"}`;
  return (
    <section className="border-y border-border py-4" aria-labelledby="planned-nutrition-heading" dir={dir}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{language === "ar" ? "المخطط" : language === "de" ? "Geplant" : "Planned"}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="planned-nutrition-heading" className="text-2xl font-semibold tracking-tight" dir="auto">
            {format(knownCalories, " kcal", locale)}{target?.calories !== null && target?.calories !== undefined ? ` / ${format(target.calories, " kcal", locale)}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">{remainingText}</p>
        </div>
        {incomplete ? <p className="text-sm text-muted-foreground">{language === "ar" ? `+ ${incomplete} عنصر بتغذية غير مكتملة` : language === "de" ? `+ ${incomplete} Element(e) ohne vollständige Nährwerte` : `+ ${incomplete} item${incomplete === 1 ? "" : "s"} without complete nutrition`}</p> : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><p className="text-muted-foreground">{nt("macroProtein")}</p><p className="font-medium" dir="auto">{format(total.protein_g, "g", locale)}{target?.protein_g !== null && target?.protein_g !== undefined ? ` / ${format(target.protein_g, "g", locale)}` : ""}</p></div>
        <div><p className="text-muted-foreground">{nt("macroCarbs")}</p><p className="font-medium" dir="auto">{format(total.carbs_g, "g", locale)}{target?.carbs_g !== null && target?.carbs_g !== undefined ? ` / ${format(target.carbs_g, "g", locale)}` : ""}</p></div>
        <div><p className="text-muted-foreground">{nt("macroFat")}</p><p className="font-medium" dir="auto">{format(total.fat_g, "g", locale)}{target?.fat_g !== null && target?.fat_g !== undefined ? ` / ${format(target.fat_g, "g", locale)}` : ""}</p></div>
      </div>
    </section>
  );
}
