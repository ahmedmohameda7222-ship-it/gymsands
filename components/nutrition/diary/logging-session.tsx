"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { normalizeProductBarcode } from "@/lib/barcodes";
import { PlateDock, type DiaryPlateItem, type DiaryPlateNutrition, type DiaryPlateSource } from "@/components/nutrition/diary/plate-dock";
import type { DiarySavedMealChoice } from "@/services/nutrition-v1/server/diary";
import type { FoodLibraryCandidate, FoodLibraryPage } from "@/services/nutrition-v1/server/food-library";
import type { RecipeHomeRecord } from "@/services/nutrition-v1/server/recipe-workspace";

export const DIARY_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

type LoggerMode = "search" | "barcode" | "quick-add" | "saved-meals" | "recipes";
type SubmitState = "editing" | "submitting" | "confirmed" | "failed";

type DraftPayload = { savedAt: number; plate: DiaryPlateItem[] };

type BarcodeFood = { name: string; brand?: string | null; servingSize?: string | null; calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null };

const nullFacts = (): DiaryPlateNutrition => ({ caloriesKcal: null, proteinG: null, carbsG: null, fatG: null });

function authHeaders(token?: string | null, json = false) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function draftKey(date: string, meal: string) {
  return `plaivra:nutrition-v1:diary-draft:${date}:${meal}`;
}

function known(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function scaleFacts(value: DiaryPlateNutrition, scale: number): DiaryPlateNutrition {
  return {
    caloriesKcal: value.caloriesKcal === null ? null : value.caloriesKcal * scale,
    proteinG: value.proteinG === null ? null : value.proteinG * scale,
    carbsG: value.carbsG === null ? null : value.carbsG * scale,
    fatG: value.fatG === null ? null : value.fatG * scale,
  };
}

function snakeFacts(value: unknown): DiaryPlateNutrition {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { caloriesKcal: known(row.calories), proteinG: known(row.protein_g), carbsG: known(row.carbs_g), fatG: known(row.fat_g) };
}

function sourceForPlate(plate: DiaryPlateItem[]) {
  if (plate.length === 1) {
    const source = plate[0].source;
    if (source.type === "recipe") return { type: "recipe" as const, id: source.id, versionId: source.recipeVersionId, frozenSnapshot: source.frozenSnapshot };
    return source;
  }
  const first = plate[0]?.source;
  if (first?.type === "saved_meal" && plate.every((item) => item.source.type === "saved_meal" && item.source.id === first.id)) {
    return { type: "saved_meal" as const, id: first.id, frozenSnapshot: { ...first.frozenSnapshot, actualItems: plate } };
  }
  if (first?.type === "recipe" && plate.every((item) => item.source.type === "recipe" && item.source.id === first.id && item.source.recipeVersionId === first.recipeVersionId)) {
    return { type: "recipe" as const, id: first.id, versionId: first.recipeVersionId, frozenSnapshot: { ...first.frozenSnapshot, actualItems: plate } };
  }
  return { type: "food" as const, id: null, frozenSnapshot: { kind: "plate", items: plate.map((item) => ({ source: item.source, foodName: item.foodName, servingLabel: item.servingLabel, quantity: item.quantity, nutrition: item.nutrition })) } };
}

export function LoggingSession({
  date,
  meal,
  savedMeals,
  onClose,
  onConfirmed,
}: {
  date: string;
  meal: string;
  savedMeals: DiarySavedMealChoice[];
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [mode, setMode] = useState<LoggerMode>("search");
  const [plate, setPlate] = useState<DiaryPlateItem[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>("editing");
  const [feedback, setFeedback] = useState("");
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodLibraryCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [barcodeFood, setBarcodeFood] = useState<BarcodeFood | null>(null);
  const [recipes, setRecipes] = useState<RecipeHomeRecord[]>([]);
  const [quickCalories, setQuickCalories] = useState("");
  const [quickProtein, setQuickProtein] = useState("");
  const [quickCarbs, setQuickCarbs] = useState("");
  const [quickFat, setQuickFat] = useState("");
  const [quickName, setQuickName] = useState("");

  const key = useMemo(() => draftKey(date, meal), [date, meal]);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as DraftPayload;
      if (Date.now() - draft.savedAt <= DIARY_DRAFT_TTL_MS && Array.isArray(draft.plate)) setPlate(draft.plate);
      else localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }, [key]);

  useEffect(() => {
    if (!plate.length) return;
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), plate } satisfies DraftPayload));
  }, [key, plate]);

  const clearConfirmedDraft = useCallback(() => {
    localStorage.removeItem(key);
  }, [key]);

  useEffect(() => {
    if (mode !== "search") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "20", locale: navigator.language.toLowerCase().startsWith("de") ? "de" : navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en" });
        const response = await fetch(`/api/nutrition/v1/foods?${params}`, { signal: controller.signal, headers: authHeaders(token) });
        if (!response.ok) throw new Error("Search could not be loaded.");
        const data = await response.json() as FoodLibraryPage;
        setFoods(data.items);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFeedback("Food search is temporarily unavailable.");
      } finally {
        setSearching(false);
      }
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, query, token]);

  useEffect(() => {
    if (mode !== "recipes") return;
    void (async () => {
      try {
        const response = await fetch("/api/nutrition/v1/recipes?limit=24", { headers: authHeaders(token) });
        if (!response.ok) throw new Error();
        const data = await response.json() as { recipes?: RecipeHomeRecord[] };
        setRecipes((data.recipes ?? []).filter((recipe) => recipe.status === "published" && Boolean(recipe.recipeVersionId)));
      } catch {
        setFeedback("Recipes are temporarily unavailable.");
      }
    })();
  }, [mode, token]);

  function pushItem(item: Omit<DiaryPlateItem, "id">) {
    setPlate((current) => [...current, { ...item, id: crypto.randomUUID() }]);
    setSubmitState("editing");
    setFeedback(`${item.foodName} added to Plate.`);
  }

  function addFood(food: FoodLibraryCandidate) {
    const nutrition = { caloriesKcal: food.nutrition.calories, proteinG: food.nutrition.protein_g, carbsG: food.nutrition.carbs_g, fatG: food.nutrition.fat_g };
    const frozenSnapshot = { name: food.name, servingLabel: food.servingLabel, nutrition, verified: food.verified, source: food.source };
    pushItem({ foodName: food.name, servingLabel: food.servingLabel, quantity: 1, nutrition, foodItemId: food.source === "catalog" ? food.id : null, userFoodItemId: food.source === "my_food" ? food.id : null, source: { type: "food", id: food.id, frozenSnapshot } });
  }

  async function lookupBarcode() {
    const clean = normalizeProductBarcode(barcode);
    if (!clean) { setFeedback("Enter a valid barcode."); return; }
    try {
      const response = await fetch(`/api/food/open-food-facts?barcode=${encodeURIComponent(clean)}`, { headers: authHeaders(token) });
      const data = await response.json().catch(() => ({})) as { food?: BarcodeFood };
      if (!response.ok || !data.food) throw new Error();
      setBarcode(clean);
      setBarcodeFood(data.food);
      setFeedback("Product found. Review it before adding to Plate.");
    } catch {
      setBarcodeFood(null);
      setFeedback("Barcode lookup failed. Use Search foods or Quick Add instead.");
    }
  }

  function addBarcodeFood() {
    if (!barcodeFood) return;
    const nutrition = { caloriesKcal: known(barcodeFood.calories), proteinG: known(barcodeFood.protein), carbsG: known(barcodeFood.carbs), fatG: known(barcodeFood.fat) };
    pushItem({ foodName: barcodeFood.name, servingLabel: barcodeFood.servingSize?.trim() || "1 serving", quantity: 1, nutrition, source: { type: "food", id: null, frozenSnapshot: { barcode, name: barcodeFood.name, brand: barcodeFood.brand ?? null, servingLabel: barcodeFood.servingSize ?? null, nutrition } } });
  }

  function addQuick() {
    const calories = Number(quickCalories);
    if (!Number.isFinite(calories) || calories < 0) { setFeedback("Quick Add requires valid calories."); return; }
    const optional = (value: string) => value.trim() === "" ? null : known(value);
    const nutrition = { caloriesKcal: calories, proteinG: optional(quickProtein), carbsG: optional(quickCarbs), fatG: optional(quickFat) };
    const name = quickName.trim() || `${Math.round(calories)} kcal`;
    pushItem({ foodName: name, servingLabel: "1 entry", quantity: 1, nutrition, source: { type: "quick_add", frozenSnapshot: { name, nutrition } } });
    setQuickCalories(""); setQuickProtein(""); setQuickCarbs(""); setQuickFat(""); setQuickName("");
  }

  function addRecipe(recipe: RecipeHomeRecord) {
    if (!recipe.recipeVersionId) return;
    const nutrition = recipe.nutritionPerServing ? { caloriesKcal: recipe.nutritionPerServing.calories, proteinG: recipe.nutritionPerServing.protein_g, carbsG: recipe.nutritionPerServing.carbs_g, fatG: recipe.nutritionPerServing.fat_g } : nullFacts();
    const frozenSnapshot = { name: recipe.name, recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, serving: { quantity: 1, label: "1 serving" }, nutrition };
    pushItem({ foodName: recipe.name, servingLabel: "1 serving", quantity: 1, nutrition, source: { type: "recipe", id: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, frozenSnapshot } });
  }

  function addSavedMeal(mealChoice: DiarySavedMealChoice) {
    const bundle = mealChoice.bundle;
    for (const raw of bundle.items) {
      if (raw.kind === "food") {
        const nutrition = snakeFacts(raw.frozen_nutrition);
        pushItem({ foodName: String(raw.frozen_name ?? "Food"), servingLabel: String(raw.resolved_serving_label ?? "Serving"), quantity: Number(raw.resolved_quantity ?? 1), nutrition, foodItemId: typeof raw.food_id === "string" ? raw.food_id : null, source: { type: "saved_meal", id: mealChoice.id, frozenSnapshot: bundle } });
      } else if (raw.kind === "recipe") {
        const recipe = raw.recipe && typeof raw.recipe === "object" && !Array.isArray(raw.recipe) ? raw.recipe as Record<string, unknown> : {};
        const nutrition = snakeFacts(recipe.frozen_nutrition);
        pushItem({ foodName: String(recipe.frozen_recipe_name ?? "Recipe"), servingLabel: String(recipe.resolved_serving_label ?? "Serving"), quantity: Number(recipe.resolved_serving_quantity ?? 1), nutrition, source: { type: "saved_meal", id: mealChoice.id, frozenSnapshot: bundle } });
      }
    }
  }

  function updateQuantity(id: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setPlate((current) => current.map((item) => item.id === id ? { ...item, nutrition: scaleFacts(item.nutrition, quantity / item.quantity), quantity } : item));
  }

  async function submitPlate() {
    if (!plate.length || submitState === "submitting") return;
    const operationId = crypto.randomUUID();
    setSubmitState("submitting");
    setFeedback("Logging Plate…");
    try {
      const response = await fetch("/api/nutrition/v1/log", {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({ operationId, date, meal, source: sourceForPlate(plate), items: plate }),
      });
      if (!response.ok) throw new Error();
      setSubmitState("confirmed");
      clearConfirmedDraft();
      setPlate([]);
      setFeedback("Plate logged.");
      onConfirmed();
    } catch {
      setSubmitState("failed");
      setFeedback("Plate was not logged. Your items are preserved for retry.");
    }
  }

  const modes: Array<{ value: LoggerMode; label: string }> = [{ value: "search", label: "Search foods" }, { value: "barcode", label: "Barcode" }, { value: "quick-add", label: "Quick Add" }, { value: "saved-meals", label: "Saved Meals" }, { value: "recipes", label: "Recipes" }];

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Add food to ${meal}`}>
      <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl sm:max-h-[calc(100vh-3rem)]">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h2 className="font-semibold">Add Food · {meal}</h2><p className="text-xs text-muted-foreground">Build one Plate, then log it when it matches what you ate.</p></div><button type="button" onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-muted" aria-label="Close logger"><X className="h-5 w-5" /></button></header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2" aria-label="Food logging tools">{modes.map((item) => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => setMode(item.value)} className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium aria-pressed:bg-foreground aria-pressed:text-background">{item.label}</button>)}</nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === "search" ? <section className="space-y-3"><label className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3"><Search className="h-4 w-4 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search foods" className="w-full bg-transparent text-sm outline-none" /></label>{searching && !foods.length ? <p className="text-sm text-muted-foreground">Searching…</p> : <div className="divide-y divide-border">{foods.map((food) => <div key={`${food.source}:${food.id}`} className="flex min-h-[72px] items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{food.name}</p><p className="text-xs text-muted-foreground">{food.servingLabel} · {food.nutrition.calories ?? "—"} kcal · P {food.nutrition.protein_g ?? "—"} g</p></div><button type="button" onClick={() => addFood(food)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Add</button></div>)}</div>}</section> : null}
          {mode === "barcode" ? <section className="space-y-3"><h3 className="font-semibold">Barcode</h3><p className="text-sm text-muted-foreground">Scan with a supported platform or enter the barcode. The resolved product stays in this Plate until you confirm logging.</p><div className="flex gap-2"><input inputMode="numeric" value={barcode} onChange={(event) => { setBarcode(event.target.value.replace(/\D/g, "")); setBarcodeFood(null); }} placeholder="Enter barcode" className="min-h-12 flex-1 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" onClick={() => void lookupBarcode()} className="min-h-12 rounded-xl border border-border px-4 text-sm font-medium">Lookup</button></div>{barcodeFood ? <div className="flex items-center gap-3 border-y border-border py-3"><div className="min-w-0 flex-1"><p className="font-semibold">{barcodeFood.name}</p><p className="text-sm text-muted-foreground">{barcodeFood.servingSize ?? "Serving"} · {barcodeFood.calories ?? "—"} kcal</p></div><button type="button" onClick={addBarcodeFood} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Add to Plate</button></div> : null}</section> : null}
          {mode === "quick-add" ? <section className="space-y-3"><div><h3 className="font-semibold">Quick Add</h3><p className="text-sm text-muted-foreground">Calories are required. Unknown macros stay unknown.</p></div><div className="grid gap-2 sm:grid-cols-2"><input value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder="Name (optional)" className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickCalories} onChange={(event) => setQuickCalories(event.target.value)} type="number" min="0" placeholder="Calories" className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickProtein} onChange={(event) => setQuickProtein(event.target.value)} type="number" min="0" placeholder="Protein g (optional)" className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickCarbs} onChange={(event) => setQuickCarbs(event.target.value)} type="number" min="0" placeholder="Carbs g (optional)" className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickFat} onChange={(event) => setQuickFat(event.target.value)} type="number" min="0" placeholder="Fat g (optional)" className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /></div><button type="button" onClick={addQuick} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Add to Plate</button></section> : null}
          {mode === "saved-meals" ? <section className="space-y-3"><div><h3 className="font-semibold">Saved Meals</h3><p className="text-sm text-muted-foreground">Add a frozen reusable bundle, then adjust the Plate before logging if needed.</p></div>{savedMeals.length ? <div className="divide-y divide-border">{savedMeals.map((saved) => <div key={saved.id} className="flex min-h-16 items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="font-semibold">{saved.name}</p><p className="text-xs text-muted-foreground">{saved.bundle.items.length} {saved.bundle.items.length === 1 ? "item" : "items"}</p></div><button type="button" onClick={() => addSavedMeal(saved)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Add to Plate</button></div>)}</div> : <p className="text-sm text-muted-foreground">No Saved Meals yet.</p>}</section> : null}
          {mode === "recipes" ? <section className="space-y-3"><div><h3 className="font-semibold">Recipes</h3><p className="text-sm text-muted-foreground">Only published Recipe versions can be logged as finished intake.</p></div>{recipes.length ? <div className="divide-y divide-border">{recipes.map((recipe) => <div key={recipe.recipeId} className="flex min-h-16 items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="font-semibold">{recipe.name}</p><p className="text-xs text-muted-foreground">1 serving · {recipe.nutritionPerServing?.calories ?? "—"} kcal</p></div><button type="button" onClick={() => addRecipe(recipe)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Add to Plate</button></div>)}</div> : <p className="text-sm text-muted-foreground">No published Recipes available.</p>}</section> : null}
          {feedback ? <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">{feedback}</p> : null}
          <PlateDock plate={plate} pending={submitState === "submitting"} onQuantityChange={updateQuantity} onRemove={(id) => setPlate((current) => current.filter((item) => item.id !== id))} onSubmit={() => void submitPlate()} />
        </div>
      </div>
    </div>
  );
}
