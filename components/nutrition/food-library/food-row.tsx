"use client";

import { Plus, ShieldCheck, Star } from "lucide-react";

import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";

function value(value: number | null, unit = "g") {
  return value === null ? "—" : `${Math.round(value * 10) / 10} ${unit}`;
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
  const tags = food.tags ?? [];
  return (
    <div className="flex min-h-[88px] items-center gap-3 border-b border-border/70 px-2 py-3 sm:px-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-base font-semibold" aria-hidden="true">
          {food.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold sm:text-[15px]">{food.name}</span>
            {food.verified ? <ShieldCheck className="h-4 w-4 shrink-0" aria-label="Plaivra Verified" /> : null}
            {tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full border border-border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{tag}</span>)}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{food.servingLabel}{food.category ? ` · ${food.category}` : ""}{food.cuisine ? ` · ${food.cuisine}` : ""}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
            <span>{food.nutrition.calories === null ? "— kcal" : `${Math.round(food.nutrition.calories)} kcal`}</span>
            <span>P {value(food.nutrition.protein_g)}</span>
            <span>C {value(food.nutrition.carbs_g)}</span>
            <span>F {value(food.nutrition.fat_g)}</span>
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {food.source === "catalog" ? <button type="button" onClick={onFavorite} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label={food.favorite ? "Remove favorite" : "Favorite food"}><Star className={`h-4 w-4 ${food.favorite ? "fill-current" : ""}`} /></button> : null}
        <button type="button" onClick={onAdd} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border hover:bg-muted" aria-label={`Add ${food.name}`}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
