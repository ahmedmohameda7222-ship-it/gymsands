"use client";

import { Plus, ShieldCheck, Star } from "lucide-react";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";

function value(value: number | null, locale: string, unit = "g") {
  return value === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round(value * 10) / 10)} ${unit}`;
}

function normalizedTag(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

export function FoodRow({
  food,
  onOpen,
  onAdd,
  onFavorite,
}: {
  food: FoodLibraryCandidate;
  onOpen: () => void;
  onAdd: () => void;
  onFavorite: () => void;
}) {
  const { nt, locale, dir } = useNutritionV1Translation();
  const nutritionLabels = food.nutritionLabels ?? [];
  const tags = (food.tags ?? []).filter((tag) => {
    const normalized = normalizedTag(tag);
    return normalized !== "high protein" && normalized !== "low carb";
  });
  return (
    <div className="flex min-h-[88px] items-center gap-3 border-b border-border/70 px-2 py-3 sm:px-3" dir={dir}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-base font-semibold" aria-hidden="true">
          {food.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <bdi className="truncate text-sm font-semibold sm:text-[15px]" dir="auto">{food.name}</bdi>
            {food.verified ? <ShieldCheck className="h-4 w-4 shrink-0" aria-label={nt("plaivraVerified")} /> : null}
            {nutritionLabels.map((label) => (
              <span key={label} className="rounded-full border border-border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
                <bdi dir="auto">{label === "high-protein" ? nt("highProtein") : label === "low-carb" ? nt("lowCarb") : label}</bdi>
              </span>
            ))}
            {tags.slice(0, Math.max(0, 2 - nutritionLabels.length)).map((tag) => (
              <span key={tag} className="rounded-full border border-border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground"><bdi dir="auto">{tag}</bdi></span>
            ))}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground"><bdi dir="auto">{food.servingLabel}</bdi>{food.category ? <> · <bdi dir="auto">{food.category}</bdi></> : null}{food.cuisine ? <> · <bdi dir="auto">{food.cuisine}</bdi></> : null}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
            <span dir="ltr">{food.nutrition.calories === null ? "— kcal" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(food.nutrition.calories))} kcal`}</span>
            <span>{nt("macroProtein")} <bdi dir="ltr">{value(food.nutrition.protein_g, locale)}</bdi></span>
            <span>{nt("macroCarbs")} <bdi dir="ltr">{value(food.nutrition.carbs_g, locale)}</bdi></span>
            <span>{nt("macroFat")} <bdi dir="ltr">{value(food.nutrition.fat_g, locale)}</bdi></span>
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {food.source === "catalog" ? <button type="button" onClick={onFavorite} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label={food.favorite ? nt("removeFavorite") : nt("favoriteFood")}><Star className={`h-4 w-4 ${food.favorite ? "fill-current" : ""}`} /></button> : null}
        <button type="button" onClick={onAdd} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border hover:bg-muted" aria-label={nt("addFoodNamed", { name: food.name })}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
