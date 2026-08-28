"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { foodLibraryApi } from "@/components/nutrition/food-library/food-library-api";
import { parseAddToHandoff, type AddToDestination } from "@/lib/nutrition-v1/add-to-handoff";
import { localeWeekStartDay, startOfMealPlanWeek } from "@/lib/nutrition-v1/week-start";

type RecipeChoice = { recipeId: string; name: string; status?: string };
type Props = { destination: AddToDestination };

async function jsonRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await foodLibraryApi(input, init);
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Nutrition handoff could not be completed.");
  return data as T;
}

export function AddToHandoffConsumer({ destination }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const source = useMemo(() => parseAddToHandoff(new URLSearchParams(search.toString()), destination), [destination, search]);
  const [sourceName, setSourceName] = useState("");
  const [date, setDate] = useState("");
  const [meal, setMeal] = useState("");
  const [savedMealName, setSavedMealName] = useState("");
  const [note, setNote] = useState("");
  const [recipeChoices, setRecipeChoices] = useState<RecipeChoice[]>([]);
  const [targetRecipeId, setTargetRecipeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!source) return;
    const current = source;
    let cancelled = false;
    void (async () => {
      try {
        const preview = current.type === "food"
          ? await jsonRequest<{ name: string }>(`/api/nutrition/v1/foods/${encodeURIComponent(current.id)}/handoff?source=${encodeURIComponent(current.source)}&quantity=${encodeURIComponent(String(current.quantity))}&serving=${encodeURIComponent(current.serving)}`)
          : await jsonRequest<{ name: string }>(`/api/nutrition/v1/recipes/${encodeURIComponent(current.id)}/handoff?recipeVersionId=${encodeURIComponent(current.versionId)}`);
        if (!cancelled) setSourceName(preview.name);
        if (destination === "recipe") {
          const result = await jsonRequest<{ recipes?: RecipeChoice[] }>("/api/nutrition/v1/recipes?limit=100");
          if (!cancelled) setRecipeChoices((result.recipes ?? []).filter((item) => item.status === "draft"));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Nutrition handoff could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [destination, source]);

  if (!source) return null;
  const currentSource = source;

  async function commit() {
    setLoading(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        destination,
        source: currentSource.type === "food"
          ? { type: "food", id: currentSource.id, source: currentSource.source, quantity: currentSource.quantity, serving: currentSource.serving }
          : { type: "recipe", id: currentSource.id, versionId: currentSource.versionId },
      };
      if (destination === "diary") {
        if (!date || !meal) throw new Error("Choose the Diary date and meal before adding this item.");
        payload.date = date;
        payload.meal = meal;
      } else if (destination === "meal_plan") {
        if (!date || !meal) throw new Error("Choose the plan date and meal slot before adding this item.");
        const locale = typeof navigator === "undefined" ? "en-GB" : navigator.language;
        payload.planDate = date;
        payload.mealSlot = meal;
        payload.weekStartDate = startOfMealPlanWeek(date, localeWeekStartDay(locale));
      } else if (destination === "saved_meal") {
        if (!savedMealName.trim()) throw new Error("Name the Saved Meal before creating it.");
        payload.name = savedMealName.trim();
        payload.note = note.trim() || null;
      } else if (destination === "recipe") {
        payload.targetRecipeId = targetRecipeId || null;
      }

      const result = await jsonRequest<{ recipeId?: string }>("/api/nutrition/v1/handoffs/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (destination === "diary") router.replace(`/calories?date=${encodeURIComponent(date)}`);
      else if (destination === "meal_plan") {
        const locale = typeof navigator === "undefined" ? "en-GB" : navigator.language;
        const week = startOfMealPlanWeek(date, localeWeekStartDay(locale));
        router.replace(`/my-meal-plan?date=${encodeURIComponent(date)}&week=${encodeURIComponent(week)}`);
      } else if (destination === "recipe" && result.recipeId) router.replace(`/my-recipes/${encodeURIComponent(result.recipeId)}/edit`);
      else router.back();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nutrition handoff could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  const title = destination === "diary" ? "Add to Diary" : destination === "meal_plan" ? "Add to Meal Plan" : destination === "saved_meal" ? "Save as Meal" : "Add Food to Recipe";
  const action = destination === "diary" ? "Add to Diary" : destination === "meal_plan" ? "Add to plan" : destination === "saved_meal" ? "Create Saved Meal" : targetRecipeId ? "Add to Working Draft" : "Add to new Recipe";
  const mealChoices = destination === "meal_plan"
    ? [{ value: "breakfast", label: "Breakfast" }, { value: "lunch", label: "Lunch" }, { value: "dinner", label: "Dinner" }, { value: "snack", label: "Snack" }]
    : [{ value: "Breakfast", label: "Breakfast" }, { value: "Lunch", label: "Lunch" }, { value: "Dinner", label: "Dinner" }, { value: "Snack", label: "Snack" }];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby={`handoff-${destination}-title`} className="w-full max-w-lg rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3">
          <div><h2 id={`handoff-${destination}-title`} className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{sourceName || "Resolving canonical Nutrition source…"}</p></div>
          <button type="button" onClick={() => router.back()} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Close Add To"><X className="h-5 w-5" /></button>
        </header>

        {(destination === "diary" || destination === "meal_plan") ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">{destination === "diary" ? "Diary date" : "Plan date"}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">{destination === "diary" ? "Diary meal" : "Meal slot"}<select value={meal} onChange={(event) => setMeal(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 font-normal"><option value="">Choose…</option>{mealChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
        </div> : null}

        {destination === "saved_meal" ? <div className="mt-5 grid gap-4"><label className="grid gap-1 text-sm font-medium">Saved Meal name<input value={savedMealName} onChange={(event) => setSavedMealName(event.target.value)} maxLength={200} className="h-11 rounded-xl border border-border bg-background px-3 font-normal" /></label><label className="grid gap-1 text-sm font-medium">Note <span className="font-normal text-muted-foreground">(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="rounded-xl border border-border bg-background p-3 font-normal" /></label></div> : null}

        {destination === "recipe" ? <div className="mt-5"><label className="grid gap-1 text-sm font-medium">Recipe authoring target<select value={targetRecipeId} onChange={(event) => setTargetRecipeId(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 font-normal"><option value="">New Recipe Working Draft</option>{recipeChoices.map((recipe) => <option key={recipe.recipeId} value={recipe.recipeId}>{recipe.name}</option>)}</select></label><p className="mt-2 text-xs text-muted-foreground">My Recipes owns the Recipe. This handoff only pre-seeds the selected Food, serving, and quantity.</p></div> : null}

        {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        <button type="button" onClick={() => void commit()} disabled={loading || !sourceName} className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? "Saving…" : action}</button>
      </section>
    </div>
  );
}
