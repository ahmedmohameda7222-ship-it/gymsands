"use client";

import Link from "next/link";
import { Minus, Plus, ShieldCheck, X } from "lucide-react";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";

function display(value: number | null, unit: string, unavailable: string) {
  return value === null ? unavailable : `${Math.round(value * 10) / 10} ${unit}`;
}

export function FoodDetail({ food, initialAdd = false, onClose }: { food: FoodLibraryCandidate; initialAdd?: boolean; onClose: () => void }) {
  const { nt, dir } = useNutritionV1Translation();
  const quantityDefault = initialAdd ? 1 : 1;
  const foodParam = encodeURIComponent(food.id);
  const sourceParam = encodeURIComponent(food.source);
  const unavailable = nt("notAvailable");
  return (
    <div dir={dir} className="fixed inset-0 z-50 flex justify-end bg-black/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={nt("foodDetails", { name: food.name })} className="h-full w-full max-w-[480px] overflow-y-auto border-s border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold"><bdi dir="auto">{food.name}</bdi></h2>{food.verified ? <ShieldCheck className="h-4 w-4" aria-label={nt("plaivraVerified")} /> : null}</div><p className="mt-1 text-sm text-muted-foreground"><bdi dir="auto">{food.category ?? nt("food")}</bdi>{food.cuisine ? <> · <bdi dir="auto">{food.cuisine}</bdi></> : null}</p></div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label={nt("closeFoodDetails")}><X className="h-5 w-5" /></button>
        </div>

        <section className="mt-6 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">{nt("serving")}</h3><p className="mt-1 text-sm text-muted-foreground"><bdi dir="auto">{food.servingLabel}</bdi></p></section>
        <section className="mt-5"><h3 className="text-sm font-semibold">{nt("quantity")}</h3><div className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-border"><button type="button" className="h-11 w-11" aria-label={nt("decreaseQuantity")}><Minus className="mx-auto h-4 w-4" /></button><span className="min-w-12 text-center text-sm font-semibold">{quantityDefault}</span><button type="button" className="h-11 w-11" aria-label={nt("increaseQuantity")}><Plus className="mx-auto h-4 w-4" /></button></div></section>

        <section className="mt-6"><h3 className="text-sm font-semibold">{nt("addTo")}</h3><div className="mt-2 grid grid-cols-2 gap-2">
          <Link href={`/calories?addFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("diary")}</Link>
          <Link href={`/my-meal-plan?addFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("mealPlan")}</Link>
          <Link href={`/calories?savedMealFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("savedMeal")}</Link>
          <Link href={`/my-recipes?ingredientFoodId=${foodParam}&source=${sourceParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("recipe")}</Link>
        </div></section>

        <section className="mt-7 border-t border-border/70 pt-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{nt("nutritionFacts")}</h3>{food.usingPersonalValues ? <span className="text-xs font-medium text-muted-foreground">{nt("usingYourValues")}</span> : null}</div><dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">{nt("calories")}</dt><dd className="font-medium">{display(food.nutrition.calories, "kcal", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroProtein")}</dt><dd className="font-medium">{display(food.nutrition.protein_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroCarbs")}</dt><dd className="font-medium">{display(food.nutrition.carbs_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroFat")}</dt><dd className="font-medium">{display(food.nutrition.fat_g, "g", unavailable)}</dd></div></dl>
          <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">{nt("moreNutrition")}</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">{nt("fiber")}</dt><dd>{display(food.nutrition.fiber_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("sugars")}</dt><dd>{display(food.nutrition.sugars_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("saturatedFat")}</dt><dd>{display(food.nutrition.saturated_fat_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("sodium")}</dt><dd>{display(food.nutrition.sodium_mg, "mg", unavailable)}</dd></div></dl></details>
        </section>
      </aside>
    </div>
  );
}
