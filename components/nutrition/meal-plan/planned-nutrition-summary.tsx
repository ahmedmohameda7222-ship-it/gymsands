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

function format(value: number | null, unit: string) {
  return value === null ? "—" : `${Math.round(value * 10) / 10}${unit}`;
}

export function PlannedNutritionSummary({ occurrences, target }: {
  occurrences: PlannedOccurrenceRow[];
  target: NutritionTargetValues | null;
}) {
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
  return (
    <section className="border-y border-border py-4" aria-labelledby="planned-nutrition-heading">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="planned-nutrition-heading" className="text-2xl font-semibold tracking-tight">
            {format(knownCalories, " kcal")}{target?.calories !== null && target?.calories !== undefined ? ` / ${format(target.calories, " kcal")}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            {difference === null ? "No complete target comparison" : difference >= 0 ? `${format(difference, " kcal")} remaining` : `${format(Math.abs(difference), " kcal")} over target`}
          </p>
        </div>
        {incomplete ? <p className="text-sm text-muted-foreground">+ {incomplete} item{incomplete === 1 ? "" : "s"} without complete nutrition</p> : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><p className="text-muted-foreground">Protein</p><p className="font-medium">{format(total.protein_g, "g")}{target?.protein_g !== null && target?.protein_g !== undefined ? ` / ${format(target.protein_g, "g")}` : ""}</p></div>
        <div><p className="text-muted-foreground">Carbs</p><p className="font-medium">{format(total.carbs_g, "g")}{target?.carbs_g !== null && target?.carbs_g !== undefined ? ` / ${format(target.carbs_g, "g")}` : ""}</p></div>
        <div><p className="text-muted-foreground">Fat</p><p className="font-medium">{format(total.fat_g, "g")}{target?.fat_g !== null && target?.fat_g !== undefined ? ` / ${format(target.fat_g, "g")}` : ""}</p></div>
      </div>
    </section>
  );
}
