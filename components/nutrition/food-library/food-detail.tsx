"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, Minus, Plus, ShieldCheck, Star } from "lucide-react";

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
  onFavorite?: (food: FoodLibraryCandidate) => void;
  onCorrect?: (food: FoodLibraryCandidate) => void;
  onEdit?: (food: FoodLibraryCandidate) => void;
  onDelete?: (food: FoodLibraryCandidate) => void;
};

export function FoodDetail({ food, initialAdd = false, onClose, onFavorite, onCorrect, onEdit, onDelete }: Props) {
  const { nt: baseNt, language, dir } = useNutritionV1Translation();
  const nt = useCallback((key: FoodLibraryTextKey, values?: Record<string, string | number>) => foodLibraryText(language, baseNt, key, values), [baseNt, language]);
  const [servingLabel, setServingLabel] = useState(food.servingLabel);
  const [quantity, setQuantity] = useState(1);
  const [addOpen, setAddOpen] = useState(initialAdd);
  const nutrition = useMemo(() => scaledNutrition(food.nutrition, quantity), [food.nutrition, quantity]);
  const foodParam = encodeURIComponent(food.id);
  const sourceParam = encodeURIComponent(food.source);
  const quantityParam = encodeURIComponent(String(quantity));
  const servingParam = encodeURIComponent(servingLabel);
  const unavailable = nt("notAvailable");
  const destinationSuffix = `addFoodId=${foodParam}&source=${sourceParam}&quantity=${quantityParam}&serving=${servingParam}`;

  return (
    <div dir={dir} className="fixed inset-0 z-50 flex justify-end bg-black/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label={nt("foodDetails", { name: food.name })} className="h-full w-full max-w-[480px] overflow-y-auto border-s border-border bg-background p-5 shadow-xl">
        <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border/70 pb-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-1 rounded-xl pe-2 text-sm font-medium hover:bg-muted" aria-label={nt("closeFoodDetails")}><ChevronLeft className="h-5 w-5 rtl:rotate-180" /><span>{nt("foodLibrary")}</span></button>
          <div className="flex items-center gap-1">
            {food.source === "catalog" ? <button type="button" onClick={() => onFavorite?.(food)} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label={food.favorite ? nt("removeFavorite") : nt("favoriteFood")}><Star className={`h-5 w-5 ${food.favorite ? "fill-current" : ""}`} /></button> : null}
            <button type="button" onClick={() => setAddOpen((open) => !open)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border hover:bg-muted" aria-label={nt("addTo")} aria-expanded={addOpen}><Plus className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="mt-5"><div className="flex items-center gap-2"><h2 className="text-xl font-semibold"><bdi dir="auto">{food.name}</bdi></h2>{food.verified ? <ShieldCheck className="h-4 w-4" aria-label={nt("plaivraVerified")} /> : null}</div><p className="mt-1 text-sm text-muted-foreground"><bdi dir="auto">{food.category ?? nt("food")}</bdi>{food.cuisine ? <> · <bdi dir="auto">{food.cuisine}</bdi></> : null}</p></div>

        <section className="mt-6 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">{nt("serving")}</h3><select value={servingLabel} onChange={(event) => setServingLabel(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value={food.servingLabel}>{food.servingLabel}</option></select></section>
        <section className="mt-5"><h3 className="text-sm font-semibold">{nt("quantity")}</h3><div className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-border"><button type="button" onClick={() => setQuantity((value) => Math.max(0.25, Math.round((value - 0.25) * 100) / 100))} className="h-11 w-11" aria-label={nt("decreaseQuantity")}><Minus className="mx-auto h-4 w-4" /></button><span className="min-w-14 text-center text-sm font-semibold" aria-live="polite">{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.round((value + 0.25) * 100) / 100)} className="h-11 w-11" aria-label={nt("increaseQuantity")}><Plus className="mx-auto h-4 w-4" /></button></div></section>

        <section className="mt-6" aria-live="polite"><div className="text-2xl font-semibold tabular-nums">{display(nutrition.calories, "kcal", unavailable)}</div><dl className="mt-3 grid grid-cols-3 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">{nt("macroProtein")}</dt><dd className="font-medium">{display(nutrition.protein_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroCarbs")}</dt><dd className="font-medium">{display(nutrition.carbs_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("macroFat")}</dt><dd className="font-medium">{display(nutrition.fat_g, "g", unavailable)}</dd></div></dl></section>

        {addOpen ? <section className="mt-6 rounded-xl border border-border p-3"><h3 className="text-sm font-semibold">{nt("addTo")}</h3><div className="mt-2 grid grid-cols-2 gap-2">
          <Link href={`/calories?${destinationSuffix}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("diary")}</Link>
          <Link href={`/my-meal-plan?${destinationSuffix}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("mealPlan")}</Link>
          <Link href={`/calories?savedMealFoodId=${foodParam}&source=${sourceParam}&quantity=${quantityParam}&serving=${servingParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("savedMeal")}</Link>
          <Link href={`/my-recipes?ingredientFoodId=${foodParam}&source=${sourceParam}&quantity=${quantityParam}&serving=${servingParam}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("recipe")}</Link>
        </div></section> : null}

        <section className="mt-7 border-t border-border/70 pt-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{nt("nutritionFacts")}</h3>{food.usingPersonalValues ? <span className="text-xs font-medium text-muted-foreground">{nt("usingYourValues")}</span> : null}</div><details className="mt-2"><summary className="cursor-pointer py-3 text-sm font-medium">{nt("moreNutrition")}</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">{nt("fiber")}</dt><dd>{display(nutrition.fiber_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("sugars")}</dt><dd>{display(nutrition.sugars_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("saturatedFat")}</dt><dd>{display(nutrition.saturated_fat_g, "g", unavailable)}</dd></div><div><dt className="text-xs text-muted-foreground">{nt("sodium")}</dt><dd>{display(nutrition.sodium_mg, "mg", unavailable)}</dd></div></dl></details></section>

        <section className="mt-7 border-t border-border/70 pt-5" aria-label={nt("foodManagement")}>
          {food.source === "catalog" ? <button type="button" onClick={() => onCorrect?.(food)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">{nt("correctForMe")}</button> : <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onEdit?.(food)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">{nt("editFood")}</button><button type="button" onClick={() => onDelete?.(food)} className="min-h-11 rounded-xl px-4 text-sm font-medium text-destructive hover:bg-destructive/10">{nt("deleteFood")}</button></div>}
        </section>
      </aside>
    </div>
  );
}
