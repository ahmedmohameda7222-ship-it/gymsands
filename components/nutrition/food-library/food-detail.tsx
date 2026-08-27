"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Minus, Plus, ShieldCheck, X } from "lucide-react";

import { foodLibraryText, type FoodLibraryTextKey } from "@/components/nutrition/food-library/food-library-copy";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { FoodLibraryCandidate, FoodLibraryNutrition } from "@/services/nutrition-v1/server/food-library";

function display(value: number | null, unit: string, unavailable: string) {
  return value === null ? unavailable : `${Math.round(value * 10) / 10} ${unit}`;
}

function scaledNutrition(nutrition: FoodLibraryNutrition, quantity: number): FoodLibraryNutrition {
  const scale = (value: number | null) => value === null ? null : Math.round(value * quantity * 10) / 10;
  return {
    calories: scale(nutrition.calories),
    protein_g: scale(nutrition.protein_g),
    carbs_g: scale(nutrition.carbs_g),
    fat_g: scale(nutrition.fat_g),
    saturated_fat_g: scale(nutrition.saturated_fat_g),
    fiber_g: scale(nutrition.fiber_g),
    sugars_g: scale(nutrition.sugars_g),
    sodium_mg: scale(nutrition.sodium_mg),
    basis_amount: nutrition.basis_amount === null ? null : Math.round(nutrition.basis_amount * quantity * 100) / 100,
    basis_unit: nutrition.basis_unit,
  };
}

type Props = {
  food: FoodLibraryCandidate;
  initialAdd?: boolean;
  onClose: () => void;
  onCorrect?: (food: FoodLibraryCandidate) => void;
  onEdit?: (food: FoodLibraryCandidate) => void;
  onDelete?: (food: FoodLibraryCandidate) => void;
};

export function FoodDetail({ food, initialAdd = false, onClose, onCorrect, onEdit, onDelete }: Props) {
  const { nt: baseNt, language, dir } = useNutritionV1Translation();
  const nt = useCallback((key: FoodLibraryTextKey, values?: Record<string, string | number>) => foodLibraryText(language, baseNt, key, values), [baseNt, language]);
  const [quantity, setQuantity] = useState(initialAdd ? 1 : 1);
  const nutrition = useMemo(() => scaledNutrition(food.nutrition, quantity), [food.nutrition, quantity]);
  const foodParam = encodeURIComponent(food.id);
  const sourceParam = encodeURIComponent(food.source);
  const quantityParam = encodeURIComponent(String(quantity));
  const servingParam = encodeURIComponent(food.servingLabel);
  const unavailable = nt("notAvailable");
  const destinationSuffix = `addFoodId=${foodParam}&source=${sourceParam}&quantity=${quantityParam}&serving=${servingParam}`;

  return (
    <div dir={dir} className="fixed inset-0 z-50 flex justify-end bg-black/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={nt("foodDetails", { name: food.name })} className="h-full w-full max-w-[480px] overflow-y-auto border-s border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold"><bdi dir="auto">{food.name}</bdi></h2>{food.verified ? <ShieldCheck className="h-4 w-4" aria-label={nt("plaivraVerified")} /> : null}</div><p className="mt-1 text-sm text-muted-foreground"><bdi dir="auto">{food.category ?? nt("food")}</bdi>{food.cuisine ? <> · <bdi dir="auto">{food.cuisine}</bdi></> : null}</p></div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label={nt("closeFoodDetails")}><X className="h-5 w-5" /></button>
        </div>

        <section className="mt-6 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">{nt("serving")}</h3><p className="mt-1 text-sm text-muted-foreground"><bdi dir="auto">{food.servingLabel}</bdi></p></section>
        <section className="mt-5"><h3 className="text-sm font-semibold">{nt("quantity")}</h3><div className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-border"><button type="button" onClick={() => setQuantity((value) => Math.max(0.25, Math.round((value - 0.25) * 100) / 100))} className="h-11 w-11" aria-label={nt("decreaseQuantity")}><Minus className="mx-auto h-4 w-4" /></button><span className="min-w-14 text-center text-sm font-semibold" aria-live="polite">{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.round((value + 0.25) * 100) / 100)} className="h-11 w-11" aria-label={nt("increaseQuantity")}><Plus className="mx-auto h-4 w-4" /></button></div></section>

        <section className="mt-6"><h3 className="text-sm font-semibold">{nt("addTo")}</h3><div className="mt-2 grid grid-cols-2 gap-2">
          <Link href={`/calories?${destinationSuffix}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("diary")}</Link>
          <Link href={`/my-meal-plan?${destinationSuffix}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("mealPlan")}</Link>
          <Link href={`/calories?savedMealFoodId=${foodParam}&source=${sourceParam}&quantity=${quantityParam}&serving=${servingParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("savedMeal")}</Link>
          <Link href={`/my-recipes?ingredientFoodId=${foodParam}&source=${sourceParam}&quantity=${quantityParam}&serving=${servingParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("recipe")}</Link>
        </div></section>

        <section className="mt-7 border-t border-border/70 pt-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{nt("nutritionFacts")}</h3>{food.usingPersonalValues ? <span className="text-xs font-medium text-muted-foreground">{nt("usingYourValues")}</span> : null}</div><dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">{nt("calories")}</dt><dd className="font-medium">{display(nutrition.calories, "kcal", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroProtein")}</dt><dd className="font-medium">{display(nutrition.protein_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroCarbs")}</dt><dd className="font-medium">{display(nutrition.carbs_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroFat")}</dt><dd className="font-medium">{display(nutrition.fat_g, "g", unavailable)}</dd></div></dl>
          <details className="mt-4"><summary className="cursor-pointer py-3 text-sm font-medium">{nt("moreNutrition")}</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">{nt("fiber")}</dt><dd>{display(nutrition.fiber_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("sugars")}</dt><dd>{display(nutrition.sugars_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("saturatedFat")}</dt><dd>{display(nutrition.saturated_fat_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("sodium")}</dt><dd>{display(nutrition.sodium_mg, "mg", unavailable)}</dd></div></dl></details>
        </section>

        <section className="mt-7 border-t border-border/70 pt-5" aria-label={nt("foodManagement")}>
          {food.source === "catalog" ? <button type="button" onClick={() => onCorrect?.(food)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">{nt("correctForMe")}</button> : <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onEdit?.(food)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">{nt("editFood")}</button><button type="button" onClick={() => onDelete?.(food)} className="min-h-11 rounded-xl px-4 text-sm font-medium text-destructive hover:bg-destructive/10">{nt("deleteFood")}</button></div>}
        </section>
      </aside>
    </div>
  );
}
