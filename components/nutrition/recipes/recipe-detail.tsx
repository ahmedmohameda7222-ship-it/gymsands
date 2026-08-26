"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, Pencil, Share2, ShieldCheck, Star, Trash2, UtensilsCrossed } from "lucide-react";

import { recipeApi } from "@/components/nutrition/recipes/recipe-api";
import {
  buildFrozenRecipeShareText,
  parsePublishedRecipeCache,
  serializePublishedRecipeCache,
  type PublishedRecipeCacheSnapshot,
  type RecipeNutritionPerServing,
} from "@/lib/nutrition-v1/recipe-cache";

type PublishedDetail = {
  root: { id: string; name: string; is_favorite: boolean; cover_path: string | null };
  latestVersion: null | { id: string; version_number: number; name: string; servings: number; total_time_minutes: number | null; notes: string | null; metadata: Record<string, unknown> };
  hasWorkingDraft?: boolean;
  ingredients: Array<{ id: string; ingredient_name: string; quantity: number | string | null; unit: string | null; food_id: string | null; verified?: boolean }>;
  instructions: Array<{ id: string; instruction: string; duration_seconds?: number | null; heat_or_temperature?: string | null; doneness_or_result_cue?: string | null }>;
  equipment: Array<{ id: string; name: string; quantity: number | string | null; note: string | null }>;
  nutritionPerServing: RecipeNutritionPerServing | null;
  cuisine: string | null;
};

const cacheKey = (recipeId: string) => `plaivra:nutrition:recipe:${recipeId}:published`;

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toSnapshot(detail: PublishedDetail): PublishedRecipeCacheSnapshot | null {
  const version = detail.latestVersion;
  if (!version) return null;
  return {
    status: "published",
    recipeId: detail.root.id,
    recipeVersionId: version.id,
    versionNumber: version.version_number,
    name: version.name,
    servings: Number(version.servings),
    totalTimeMinutes: numberOrNull(version.total_time_minutes),
    cuisine: detail.cuisine,
    favorite: detail.root.is_favorite === true,
    coverPhotoUrl: null,
    ingredients: detail.ingredients.map((item) => ({
      ingredientName: item.ingredient_name,
      quantity: numberOrNull(item.quantity),
      unit: item.unit,
      foodId: item.food_id,
      verified: item.verified === true,
    })),
    instructions: detail.instructions.map((item) => item.instruction),
    nutritionPerServing: detail.nutritionPerServing,
    cachedAt: new Date().toISOString(),
  };
}

function cachedDetail(snapshot: PublishedRecipeCacheSnapshot): PublishedDetail {
  return {
    root: { id: snapshot.recipeId, name: snapshot.name, is_favorite: snapshot.favorite, cover_path: null },
    latestVersion: { id: snapshot.recipeVersionId, version_number: snapshot.versionNumber, name: snapshot.name, servings: snapshot.servings, total_time_minutes: snapshot.totalTimeMinutes, notes: null, metadata: {} },
    ingredients: snapshot.ingredients.map((item, index) => ({ id: String(index), ingredient_name: item.ingredientName, quantity: item.quantity, unit: item.unit, food_id: item.foodId, verified: item.verified })),
    instructions: snapshot.instructions.map((instruction, index) => ({ id: String(index), instruction })),
    equipment: [],
    nutritionPerServing: snapshot.nutritionPerServing,
    cuisine: snapshot.cuisine,
    hasWorkingDraft: false,
  };
}

function nutrient(value: number | null, unit: string) {
  return value === null ? "—" : `${value} ${unit}`;
}

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<PublishedDetail | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await recipeApi<{ recipe: PublishedDetail }>(`/${recipeId}?published=true`);
      setDetail(result.recipe);
      setCached(false);
      setError(null);
      const snapshot = toSnapshot(result.recipe);
      if (snapshot) window.localStorage.setItem(cacheKey(recipeId), serializePublishedRecipeCache(snapshot));
    } catch (cause) {
      const snapshot = parsePublishedRecipeCache(window.localStorage.getItem(cacheKey(recipeId)));
      if (snapshot) {
        setDetail(cachedDetail(snapshot));
        setCached(true);
        setError(null);
      } else {
        setError(cause instanceof Error ? cause.message : "Recipe could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => { void load(); }, [load]);

  const snapshot = useMemo(() => detail ? toSnapshot(detail) : null, [detail]);
  const isPublished = Boolean(detail?.latestVersion);

  async function share() {
    if (!snapshot) return;
    const text = buildFrozenRecipeShareText(snapshot);
    try {
      if (navigator.share) await navigator.share({ title: snapshot.name, text });
      else await navigator.clipboard.writeText(text);
      setShareStatus("Shared from this frozen published Recipe version.");
    } catch {
      setShareStatus("Share was cancelled.");
    }
  }

  async function duplicate() {
    if (cached) return;
    const result = await recipeApi<{ recipeId: string }>(`/${recipeId}`, { method: "POST", body: JSON.stringify({ operation: "duplicate" }) });
    router.push(`/my-recipes/${result.recipeId}/edit`);
  }

  async function remove() {
    if (cached) return;
    await recipeApi(`/${recipeId}`, { method: "DELETE" });
    router.push("/my-recipes");
    router.refresh();
  }

  if (loading) return <div className="mx-auto max-w-[720px] space-y-3 px-4 py-6"><div className="h-10 animate-pulse rounded-xl bg-muted" /><div className="h-44 animate-pulse rounded-2xl bg-muted" /></div>;
  if (error) return <div className="mx-auto max-w-[720px] px-4 py-6"><p className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive" role="alert">{error}</p></div>;
  if (!detail) return null;

  if (!isPublished) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-6">
        <p className="text-sm text-muted-foreground">Draft</p>
        <h1 className="mt-1 text-2xl font-semibold">{detail.root.name}</h1>
        <p className="mt-3 text-sm text-muted-foreground">This Recipe is still a Working Draft. Finished-use actions stay unavailable until Save Recipe creates a published version.</p>
        <Link href={`/my-recipes/${recipeId}/edit`} className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">Continue editing</Link>
      </div>
    );
  }

  const version = detail.latestVersion!;
  const n = detail.nutritionPerServing;
  return (
    <article className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-5 sm:px-6">
      <header className="space-y-4 border-b border-border/70 pb-5">
        <div className="flex min-h-40 items-center justify-center rounded-2xl bg-muted" aria-hidden="true"><BookOpen className="h-10 w-10 text-muted-foreground" /></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{version.name}</h1>{detail.root.is_favorite ? <Star className="h-4 w-4 fill-current" aria-label="Favorite" /> : null}</div>
            <p className="mt-1 text-sm text-muted-foreground">Published · {version.servings} servings{version.total_time_minutes !== null ? ` · ${version.total_time_minutes} min` : ""}{detail.cuisine ? ` · ${detail.cuisine}` : ""}</p>
            {cached ? <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Offline · showing your cached published Recipe</p> : null}
            {detail.hasWorkingDraft && !cached ? <Link href={`/my-recipes/${recipeId}/edit`} className="mt-2 inline-block text-sm font-medium underline underline-offset-4">Continue editing Working Draft</Link> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/my-recipes/${recipeId}/cook`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-3 text-sm font-medium text-background"><UtensilsCrossed className="h-4 w-4" />Start Cooking</Link>
            <details className="relative"><summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Add to…</summary><div className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-border bg-popover p-1 shadow-lg"><Link className="block rounded-lg px-3 py-2 text-sm hover:bg-muted" href={`/calories?source=recipe&recipeId=${recipeId}&recipeVersionId=${version.id}`}>Diary</Link><Link className="block rounded-lg px-3 py-2 text-sm hover:bg-muted" href={`/my-meal-plan?source=recipe&recipeId=${recipeId}&recipeVersionId=${version.id}`}>Meal Plan</Link><span className="block px-3 py-2 text-sm text-muted-foreground">Saved Meal</span></div></details>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border/70 pt-3">
          <Link href={`/my-recipes/${recipeId}/edit`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted"><Pencil className="h-4 w-4" />Edit</Link>
          <button type="button" disabled={cached} onClick={() => void duplicate()} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4" />Duplicate</button>
          <button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted"><Share2 className="h-4 w-4" />Share</button>
          <button type="button" disabled={cached} onClick={() => void remove()} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" />Delete</button>
        </div>
        {shareStatus ? <p className="text-xs text-muted-foreground" role="status">{shareStatus}</p> : null}
      </header>

      <section aria-labelledby="nutrition-heading">
        <div className="flex items-center justify-between gap-3"><h2 id="nutrition-heading" className="text-lg font-semibold">Nutrition per serving</h2><span className="text-xs text-muted-foreground">Plaivra-resolved facts only</span></div>
        <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Calories</p><p className="font-semibold">{nutrient(n?.calories ?? null, "kcal")}</p></div>
          <div><p className="text-xs text-muted-foreground">Protein</p><p className="font-semibold">{nutrient(n?.protein_g ?? null, "g")}</p></div>
          <div><p className="text-xs text-muted-foreground">Carbs</p><p className="font-semibold">{nutrient(n?.carbs_g ?? null, "g")}</p></div>
          <div><p className="text-xs text-muted-foreground">Fat</p><p className="font-semibold">{nutrient(n?.fat_g ?? null, "g")}</p></div>
        </div>
        <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">More nutrition</summary><p className="mt-2 text-sm text-muted-foreground">Additional nutrients appear only when the underlying Plaivra Food facts are available.</p></details>
      </section>

      <section aria-labelledby="ingredients-heading"><h2 id="ingredients-heading" className="text-lg font-semibold">Ingredients</h2><div className="mt-2 divide-y divide-border/70">{detail.ingredients.map((item) => <div key={item.id} className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm"><span className="flex items-center gap-1.5">{item.ingredient_name}{item.verified ? <ShieldCheck className="h-3.5 w-3.5" aria-label="Plaivra Verified" /> : null}</span><span className="shrink-0 text-muted-foreground">{item.quantity ?? "As needed"}{item.quantity !== null && item.unit ? ` ${item.unit}` : ""}</span></div>)}</div></section>

      <section aria-labelledby="instructions-heading"><h2 id="instructions-heading" className="text-lg font-semibold">Instructions</h2><ol className="mt-3 space-y-4">{detail.instructions.map((step, index) => <li key={step.id} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><div><p className="text-sm leading-6">{step.instruction}</p>{step.duration_seconds || step.heat_or_temperature || step.doneness_or_result_cue ? <p className="mt-1 text-xs text-muted-foreground">{[step.duration_seconds ? `${Math.round(step.duration_seconds / 60)} min` : null, step.heat_or_temperature, step.doneness_or_result_cue].filter(Boolean).join(" · ")}</p> : null}</div></li>)}</ol></section>

      {detail.equipment.length ? <section aria-labelledby="equipment-heading"><h2 id="equipment-heading" className="text-lg font-semibold">Equipment</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{detail.equipment.map((item) => <li key={item.id}>{item.name}{item.quantity ? ` · ${item.quantity}` : ""}</li>)}</ul></section> : null}
      {version.notes ? <section><h2 className="text-lg font-semibold">Notes</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{version.notes}</p></section> : null}
    </article>
  );
}
