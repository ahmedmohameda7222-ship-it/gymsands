"use client";

import Link from "next/link";
import { Minus, Plus, ShieldCheck, X } from "lucide-react";

import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";

function display(value: number | null, unit: string) {
  return value === null ? "Not available" : `${Math.round(value * 10) / 10} ${unit}`;
}

export function FoodDetail({ food, initialAdd = false, onClose }: { food: FoodLibraryCandidate; initialAdd?: boolean; onClose: () => void }) {
  const quantityDefault = initialAdd ? 1 : 1;
  const foodParam = encodeURIComponent(food.id);
  const sourceParam = encodeURIComponent(food.source);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={`${food.name} details`} className="h-full w-full max-w-[480px] overflow-y-auto border-l border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{food.name}</h2>{food.verified ? <ShieldCheck className="h-4 w-4" aria-label="Plaivra Verified" /> : null}</div><p className="mt-1 text-sm text-muted-foreground">{food.category ?? "Food"}{food.cuisine ? ` · ${food.cuisine}` : ""}</p></div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Close food details"><X className="h-5 w-5" /></button>
        </div>

        <section className="mt-6 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">Serving</h3><p className="mt-1 text-sm text-muted-foreground">{food.servingLabel}</p></section>
        <section className="mt-5"><h3 className="text-sm font-semibold">Quantity</h3><div className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-border"><button type="button" className="h-11 w-11" aria-label="Decrease quantity"><Minus className="mx-auto h-4 w-4" /></button><span className="min-w-12 text-center text-sm font-semibold">{quantityDefault}</span><button type="button" className="h-11 w-11" aria-label="Increase quantity"><Plus className="mx-auto h-4 w-4" /></button></div></section>

        <section className="mt-6"><h3 className="text-sm font-semibold">Add to</h3><div className="mt-2 grid grid-cols-2 gap-2">
          <Link href={`/calories?addFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Diary</Link>
          <Link href={`/my-meal-plan?addFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Meal Plan</Link>
          <Link href={`/calories?savedMealFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Saved Meal</Link>
          <Link href={`/my-recipes?ingredientFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Recipe</Link>
        </div></section>

        <section className="mt-7 border-t border-border/70 pt-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Nutrition facts</h3>{food.usingPersonalValues ? <span className="text-xs font-medium text-muted-foreground">Using your values</span> : null}</div><dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Calories</dt><dd className="font-medium">{display(food.nutrition.calories, "kcal")}</dd></div><div><dt className="text-xs text-muted-foreground">Protein</dt><dd className="font-medium">{display(food.nutrition.protein_g, "g")}</dd></div><div><dt className="text-xs text-muted-foreground">Carbs</dt><dd className="font-medium">{display(food.nutrition.carbs_g, "g")}</dd></div><div><dt className="text-xs text-muted-foreground">Fat</dt><dd className="font-medium">{display(food.nutrition.fat_g, "g")}</dd></div></dl>
          <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">More Nutrition</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Fiber</dt><dd>{display(food.nutrition.fiber_g, "g")}</dd></div><div><dt className="text-xs text-muted-foreground">Sugars</dt><dd>{display(food.nutrition.sugars_g, "g")}</dd></div><div><dt className="text-xs text-muted-foreground">Saturated fat</dt><dd>{display(food.nutrition.saturated_fat_g, "g")}</dd></div><div><dt className="text-xs text-muted-foreground">Sodium</dt><dd>{display(food.nutrition.sodium_mg, "mg")}</dd></div></dl></details>
        </section>
      </aside>
    </div>
  );
}
