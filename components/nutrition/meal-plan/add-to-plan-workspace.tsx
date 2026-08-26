"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { mealPlanApi } from "./meal-plan-api";
import type { MealPlanOccurrenceMutation } from "@/services/nutrition-v1/server/meal-plan";
import type { FoodLibraryCandidate, FoodLibraryPage } from "@/services/nutrition-v1/server/food-library";
import type { RecipeHomeRecord } from "@/services/nutrition-v1/server/recipe-workspace";
import type { DiaryProjection, DiarySavedMealChoice } from "@/services/nutrition-v1/server/diary";

type SearchScope = "all" | "recent" | "favorites";
type SearchResult =
  | { kind: "food"; id: string; name: string; detail: string; value: FoodLibraryCandidate }
  | { kind: "recipe"; id: string; name: string; detail: string; value: RecipeHomeRecord }
  | { kind: "saved_meal"; id: string; name: string; detail: string; value: DiarySavedMealChoice };

function diaryNutrition(nutrition: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null | undefined) {
  return {
    caloriesKcal: nutrition?.calories ?? null,
    proteinG: nutrition?.protein_g ?? null,
    carbsG: nutrition?.carbs_g ?? null,
    fatG: nutrition?.fat_g ?? null,
  };
}

function foodMutation(food: FoodLibraryCandidate, date: string, mealSlotKey: string): MealPlanOccurrenceMutation {
  const frozenNutrition = {
    calories: food.nutrition.calories,
    protein_g: food.nutrition.protein_g,
    carbs_g: food.nutrition.carbs_g,
    fat_g: food.nutrition.fat_g,
    fiber_g: food.nutrition.fiber_g,
  };
  return {
    planDate: date,
    mealSlotKey,
    sourceType: "food",
    sourceId: food.id,
    resolvedQuantity: 1,
    resolvedServingLabel: food.servingLabel,
    frozenName: food.name,
    frozenSnapshot: {
      food_id: food.id,
      frozen_name: food.name,
      resolved_quantity: 1,
      resolved_serving_label: food.servingLabel,
      frozen_nutrition: frozenNutrition,
      verified: food.verified,
      items: [{ foodName: food.name, servingLabel: food.servingLabel, quantity: 1, nutrition: diaryNutrition(frozenNutrition) }],
      shoppingIngredients: [{ foodId: food.id, name: food.name, quantity: 1, unit: food.servingLabel, qualifier: null }],
    },
  };
}

function savedMealLogItems(choice: DiarySavedMealChoice) {
  return choice.bundle.items.map((raw) => {
    const item = raw as Record<string, any>;
    if (item.kind === "recipe" && item.recipe) {
      return {
        foodName: item.recipe.frozen_recipe_name,
        servingLabel: item.recipe.resolved_serving_label,
        quantity: item.recipe.resolved_serving_quantity,
        nutrition: diaryNutrition(item.recipe.frozen_nutrition),
      };
    }
    return {
      foodName: item.frozen_name,
      servingLabel: item.resolved_serving_label,
      quantity: item.resolved_quantity,
      nutrition: diaryNutrition(item.frozen_nutrition),
    };
  });
}

export function AddToPlanWorkspace({ date, mealSlotKey, onClose, onCommit }: {
  date: string;
  mealSlotKey: string;
  onClose: () => void;
  onCommit: (items: MealPlanOccurrenceMutation[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedItems, setSelectedItems] = useState<MealPlanOccurrenceMutation[]>([]);
  const [placeholderName, setPlaceholderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "12" });
        if (scope !== "all") params.set("scope", scope);
        const [foods, recipes, diary] = await Promise.all([
          mealPlanApi<FoodLibraryPage>(`/api/nutrition/v1/foods?${params.toString()}`),
          mealPlanApi<{ recipes: RecipeHomeRecord[] }>(`/api/nutrition/v1/recipes?q=${encodeURIComponent(query)}&limit=12`),
          mealPlanApi<DiaryProjection>(`/api/nutrition/v1/diary?date=${encodeURIComponent(date)}`),
        ]);
        if (!active) return;
        const savedMeals = diary.domains.savedMeals.status === "ready" ? diary.domains.savedMeals.data : [];
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const foodResults: SearchResult[] = foods.items.map((value) => ({ kind: "food", id: value.id, name: value.name, detail: `${value.servingLabel} · Food`, value }));
        const recipeResults: SearchResult[] = recipes.recipes
          .filter((value) => value.status === "published" && value.recipeVersionId)
          .filter((value) => scope !== "favorites" || value.favorite)
          .filter((value) => scope !== "recent" || value.lastUsedAt)
          .map((value) => ({ kind: "recipe", id: value.recipeId, name: value.name, detail: `Recipe · ${value.nutritionPerServing?.calories ?? "—"} kcal`, value }));
        const savedResults: SearchResult[] = savedMeals
          .filter((value) => !normalizedQuery || value.name.toLocaleLowerCase().includes(normalizedQuery))
          .map((value) => ({ kind: "saved_meal", id: value.id, name: value.name, detail: "Saved Meal", value }));
        setResults([...foodResults, ...recipeResults, ...savedResults].slice(0, 24));
        setError("");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Search could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [date, query, scope]);

  const selectedNames = useMemo(() => selectedItems.map((item) => item.frozenName), [selectedItems]);

  async function selectResult(result: SearchResult) {
    if (result.kind === "food") {
      setSelectedItems((current) => [...current, foodMutation(result.value, date, mealSlotKey)]);
      return;
    }
    if (result.kind === "saved_meal") {
      const choice = result.value;
      setSelectedItems((current) => [...current, {
        planDate: date,
        mealSlotKey,
        sourceType: "saved_meal",
        sourceId: choice.id,
        resolvedQuantity: 1,
        resolvedServingLabel: "1 saved meal",
        frozenName: choice.name,
        frozenSnapshot: { ...choice.bundle, items: savedMealLogItems(choice), shoppingIngredients: [] },
      }]);
      return;
    }
    try {
      setLoading(true);
      const response = await mealPlanApi<{ recipe: Record<string, any> }>(`/api/nutrition/v1/recipes/${encodeURIComponent(result.id)}?published=true`);
      const recipe = response.recipe;
      const version = recipe.latestVersion as Record<string, any> | null;
      if (!version?.id) throw new Error("Published Recipe version is unavailable.");
      const servings = Number(version.servings) > 0 ? Number(version.servings) : 1;
      const nutrition = recipe.nutritionPerServing as { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null;
      const shoppingIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.flatMap((raw: Record<string, any>) => {
        const quantity = Number(raw.quantity);
        if (typeof raw.food_id !== "string" || !raw.food_id || !Number.isFinite(quantity) || quantity <= 0 || typeof raw.unit !== "string" || !raw.unit.trim()) return [];
        return [{ foodId: raw.food_id, name: String(raw.ingredient_name || result.name), quantity: quantity / servings, unit: raw.unit.trim(), qualifier: null }];
      }) : [];
      setSelectedItems((current) => [...current, {
        planDate: date,
        mealSlotKey,
        sourceType: "recipe",
        sourceId: result.id,
        sourceVersionId: String(version.id),
        resolvedQuantity: 1,
        resolvedServingLabel: "1 serving",
        frozenName: result.name,
        frozenSnapshot: {
          recipe_id: result.id,
          recipe_version_id: String(version.id),
          resolved_serving_quantity: 1,
          resolved_serving_label: "1 serving",
          frozen_recipe_name: result.name,
          frozen_nutrition: nutrition ?? { calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null },
          items: [{ foodName: result.name, servingLabel: "1 serving", quantity: 1, nutrition: diaryNutrition(nutrition) }],
          shoppingIngredients,
        },
      }]);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recipe could not be selected.");
    } finally {
      setLoading(false);
    }
  }

  function addPlaceholder() {
    const name = placeholderName.trim();
    if (!name) return;
    setSelectedItems((current) => [...current, {
      planDate: date,
      mealSlotKey,
      sourceType: "placeholder",
      frozenName: name,
      frozenSnapshot: { name, unverified: true },
    }]);
    setPlaceholderName("");
  }

  async function commit() {
    if (!selectedItems.length || saving) return;
    setSaving(true);
    try { await onCommit(selectedItems); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Plan could not be saved."); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-label={`Add to ${mealSlotKey}`}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-t-3xl bg-background p-4 shadow-xl sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Add to {mealSlotKey}</h2><p className="text-sm text-muted-foreground">{date} · Select multiple items, then add once.</p></div><button type="button" onClick={onClose} aria-label="Close" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-muted"><X className="h-5 w-5" /></button></div>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search foods, recipes, meals…" className="mt-4 min-h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div className="mt-2 flex gap-1" aria-label="Search scope"><button type="button" onClick={() => setScope("recent")} className={`min-h-11 rounded-xl px-3 text-sm font-medium ${scope === "recent" ? "bg-muted" : ""}`}>Recent</button><button type="button" onClick={() => setScope("favorites")} className={`min-h-11 rounded-xl px-3 text-sm font-medium ${scope === "favorites" ? "bg-muted" : ""}`}>Favorites</button><button type="button" onClick={() => setScope("all")} className={`min-h-11 rounded-xl px-3 text-sm font-medium ${scope === "all" ? "bg-muted" : ""}`}>All</button></div>
        {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-3 divide-y divide-border" aria-live="polite">{loading ? <p className="py-4 text-sm text-muted-foreground">Searching…</p> : results.map((result) => <button key={`${result.kind}:${result.id}`} type="button" onClick={() => void selectResult(result)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left"><span className="min-w-0"><span className="block truncate text-sm font-medium">{result.name}</span><span className="block text-xs text-muted-foreground">{result.detail}</span></span><Plus className="h-4 w-4 shrink-0" /></button>)}</div>
        <div className="mt-4 border-t border-border pt-4"><label className="text-sm font-medium" htmlFor="meal-plan-placeholder">Plan something not resolved yet</label><div className="mt-2 flex gap-2"><input id="meal-plan-placeholder" value={placeholderName} onChange={(event) => setPlaceholderName(event.target.value)} placeholder="Restaurant meal or travel meal" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" onClick={addPlaceholder} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Add Placeholder</button></div></div>
        {selectedItems.length ? <div className="mt-4 border-t border-border pt-4"><p className="text-sm font-semibold">Selected ({selectedItems.length})</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{selectedNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul></div> : null}
        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t border-border bg-background pt-4"><button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" disabled={!selectedItems.length || saving} onClick={() => void commit()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">{saving ? "Saving…" : `Add ${selectedItems.length || ""}`.trim()}</button></div>
      </div>
    </div>
  );
}
