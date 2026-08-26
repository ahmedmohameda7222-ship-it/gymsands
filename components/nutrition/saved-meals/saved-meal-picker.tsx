"use client";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

export type SavedMealPickerItem = {
  id: string;
  name: string;
  itemCount: number;
  summary: string | null;
};

export type SavedMealPickerProps = {
  meals: SavedMealPickerItem[];
  onPick: (id: string) => void;
  disabled?: boolean;
};

export function SavedMealPicker({ meals, onPick, disabled = false }: SavedMealPickerProps) {
  const { nt, dir } = useNutritionV1Translation();
  return (
    <section dir={dir} data-saved-meal-contextual="picker" className="space-y-3" aria-labelledby="saved-meal-picker-heading">
      <div className="space-y-1">
        <h2 id="saved-meal-picker-heading" className="text-lg font-semibold text-foreground">{nt("savedMeals")}</h2>
        <p className="text-sm text-muted-foreground">{nt("chooseSavedMeal")}</p>
      </div>

      {meals.length ? (
        <div className="divide-y divide-border border-y border-border">
          {meals.map((meal) => (
            <button key={meal.id} type="button" data-saved-meal-id={meal.id} onClick={() => onPick(meal.id)} disabled={disabled} className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-start outline-none transition hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground"><bdi dir="auto">{meal.name}</bdi></span>
                <span className="block text-xs text-muted-foreground">{meal.itemCount} {nt(meal.itemCount === 1 ? "itemSingular" : "itemPlural")}</span>
              </span>
              {meal.summary ? <span className="shrink-0 text-sm font-medium text-muted-foreground"><bdi dir="auto">{meal.summary}</bdi></span> : null}
            </button>
          ))}
        </div>
      ) : <p className="border-y border-border py-5 text-sm text-muted-foreground">{nt("noSavedMeals")}</p>}
    </section>
  );
}
