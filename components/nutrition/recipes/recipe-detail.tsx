"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, Pencil, Share2, ShieldCheck, Star, Trash2, UtensilsCrossed } from "lucide-react";

import { recipeApi } from "@/components/nutrition/recipes/recipe-api";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import { buildFrozenRecipeShareText, parsePublishedRecipeCache, serializePublishedRecipeCache, type PublishedRecipeCacheSnapshot, type RecipeNutritionPerServing } from "@/lib/nutrition-v1/recipe-cache";

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
function numberOrNull(value: number | string | null | undefined) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function toSnapshot(detail: PublishedDetail): PublishedRecipeCacheSnapshot | null {
  const version = detail.latestVersion; if (!version) return null;
  return { status: "published", recipeId: detail.root.id, recipeVersionId: version.id, versionNumber: version.version_number, name: version.name, servings: Number(version.servings), totalTimeMinutes: numberOrNull(version.total_time_minutes), cuisine: detail.cuisine, favorite: detail.root.is_favorite === true, coverPhotoUrl: null, ingredients: detail.ingredients.map((item) => ({ ingredientName: item.ingredient_name, quantity: numberOrNull(item.quantity), unit: item.unit, foodId: item.food_id, verified: item.verified === true })), instructions: detail.instructions.map((item) => item.instruction), nutritionPerServing: detail.nutritionPerServing, cachedAt: new Date().toISOString() };
}
function cachedDetail(snapshot: PublishedRecipeCacheSnapshot): PublishedDetail { return { root: { id: snapshot.recipeId, name: snapshot.name, is_favorite: snapshot.favorite, cover_path: null }, latestVersion: { id: snapshot.recipeVersionId, version_number: snapshot.versionNumber, name: snapshot.name, servings: snapshot.servings, total_time_minutes: snapshot.totalTimeMinutes, notes: null, metadata: {} }, ingredients: snapshot.ingredients.map((item, index) => ({ id: String(index), ingredient_name: item.ingredientName, quantity: item.quantity, unit: item.unit, food_id: item.foodId, verified: item.verified })), instructions: snapshot.instructions.map((instruction, index) => ({ id: String(index), instruction })), equipment: [], nutritionPerServing: snapshot.nutritionPerServing, cuisine: snapshot.cuisine, hasWorkingDraft: false }; }
function nutrient(value: number | null, unit: string, unavailable: string) { return value === null ? unavailable : `${value} ${unit}`; }

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const { nt, dir } = useNutritionV1Translation();
  const [detail, setDetail] = useState<PublishedDetail | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await recipeApi<{ recipe: PublishedDetail }>(`/${recipeId}?published=true`); setDetail(result.recipe); setCached(false); setError(null); const snapshot = toSnapshot(result.recipe); if (snapshot) window.localStorage.setItem(cacheKey(recipeId), serializePublishedRecipeCache(snapshot)); }
    catch (cause) { const snapshot = parsePublishedRecipeCache(window.localStorage.getItem(cacheKey(recipeId))); if (snapshot) { setDetail(cachedDetail(snapshot)); setCached(true); setError(null); } else setError(cause instanceof Error ? cause.message : nt("recipeLoadFailed")); }
    finally { setLoading(false); }
  }, [nt, recipeId]);
  useEffect(() => { void load(); }, [load]);

  const snapshot = useMemo(() => detail ? toSnapshot(detail) : null, [detail]);
  const isPublished = Boolean(detail?.latestVersion);

  async function share() { if (!snapshot) return; const text = buildFrozenRecipeShareText(snapshot); try { if (navigator.share) await navigator.share({ title: snapshot.name, text }); else await navigator.clipboard.writeText(text); setShareStatus(nt("sharedFrozenRecipe")); } catch { setShareStatus(nt("shareCancelled")); } }
  async function duplicate() { if (cached) return; const result = await recipeApi<{ recipeId: string }>(`/${recipeId}`, { method: "POST", body: JSON.stringify({ operation: "duplicate" }) }); router.push(`/my-recipes/${result.recipeId}/edit`); }
  async function remove() { if (cached) return; await recipeApi(`/${recipeId}`, { method: "DELETE" }); router.push("/my-recipes"); router.refresh(); }

  if (loading) return <div className="mx-auto max-w-[720px] space-y-3 px-4 py-6"><div className="h-10 animate-pulse rounded-xl bg-muted" /><div className="h-44 animate-pulse rounded-2xl bg-muted" /></div>;
  if (error) return <div dir={dir} className="mx-auto max-w-[720px] px-4 py-6"><p className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive" role="alert">{error}</p></div>;
  if (!detail) return null;

  if (!isPublished) return <div dir={dir} className="mx-auto max-w-[720px] px-4 py-6"><p className="text-sm text-muted-foreground">{nt("draft")}</p><h1 className="mt-1 text-2xl font-semibold"><bdi dir="auto">{detail.root.name}</bdi></h1><p className="mt-3 text-sm text-muted-foreground">{nt("workingDraftDescription")}</p><Link href={`/my-recipes/${recipeId}/edit`} className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">{nt("continueEditing")}</Link></div>;

  const version = detail.latestVersion!;
  const n = detail.nutritionPerServing;
  const unavailable = nt("notAvailable");
  return (
    <article dir={dir} className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-5 sm:px-6">
      <header className="space-y-4 border-b border-border/70 pb-5">
        <div className="flex min-h-40 items-center justify-center rounded-2xl bg-muted" aria-hidden="true"><BookOpen className="h-10 w-10 text-muted-foreground" /></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight"><bdi dir="auto">{version.name}</bdi></h1>{detail.root.is_favorite ? <Star className="h-4 w-4 fill-current" aria-label={nt("favorite")} /> : null}</div>
            <p className="mt-1 text-sm text-muted-foreground">{nt("published")} · {nt("servingsCount", { count: version.servings })}{version.total_time_minutes !== null ? ` · ${nt("minutesShort", { count: version.total_time_minutes })}` : ""}{detail.cuisine ? <> · <bdi dir="auto">{detail.cuisine}</bdi></> : null}</p>
            {cached ? <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{nt("offlineCachedRecipe")}</p> : null}
            {detail.hasWorkingDraft && !cached ? <Link href={`/my-recipes/${recipeId}/edit`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{nt("continueWorkingDraft")}</Link> : null}
          </div>
          <div className="flex flex-wrap gap-2"><Link href={`/my-recipes/${recipeId}/cook`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-3 text-sm font-medium text-background"><UtensilsCrossed className="h-4 w-4" />{nt("startCooking")}</Link><details className="relative"><summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("addTo")}…</summary><div className="absolute end-0 z-20 mt-1 min-w-44 rounded-xl border border-border bg-popover p-1 shadow-lg"><Link className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-muted" href={`/calories?source=recipe&recipeId=${recipeId}&recipeVersionId=${version.id}`}>{nt("diary")}</Link><Link className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-muted" href={`/my-meal-plan?source=recipe&recipeId=${recipeId}&recipeVersionId=${version.id}`}>{nt("mealPlan")}</Link><span className="flex min-h-11 items-center px-3 text-sm text-muted-foreground">{nt("savedMeal")}</span></div></details></div>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border/70 pt-3"><Link href={`/my-recipes/${recipeId}/edit`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted"><Pencil className="h-4 w-4" />{nt("edit")}</Link><button type="button" disabled={cached} onClick={() => void duplicate()} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4" />{nt("duplicate")}</button><button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted"><Share2 className="h-4 w-4" />{nt("share")}</button><button type="button" disabled={cached} onClick={() => void remove()} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" />{nt("delete")}</button></div>
        {shareStatus ? <p className="text-xs text-muted-foreground" role="status">{shareStatus}</p> : null}
      </header>

      <section aria-labelledby="nutrition-heading"><div className="flex items-center justify-between gap-3"><h2 id="nutrition-heading" className="text-lg font-semibold">{nt("nutritionPerServing")}</h2><span className="text-xs text-muted-foreground">{nt("plaivraFactsOnly")}</span></div><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">{nt("calories")}</p><p className="font-semibold">{nutrient(n?.calories ?? null, "kcal", unavailable)}</p></div><div><p className="text-xs text-muted-foreground">{nt("macroProtein")}</p><p className="font-semibold">{nutrient(n?.protein_g ?? null, "g", unavailable)}</p></div><div><p className="text-xs text-muted-foreground">{nt("macroCarbs")}</p><p className="font-semibold">{nutrient(n?.carbs_g ?? null, "g", unavailable)}</p></div><div><p className="text-xs text-muted-foreground">{nt("macroFat")}</p><p className="font-semibold">{nutrient(n?.fat_g ?? null, "g", unavailable)}</p></div></div><details className="mt-3"><summary className="cursor-pointer text-sm font-medium">{nt("moreNutrition")}</summary><p className="mt-2 text-sm text-muted-foreground">{nt("moreNutritionDescription")}</p></details></section>

      <section aria-labelledby="ingredients-heading"><h2 id="ingredients-heading" className="text-lg font-semibold">{nt("ingredients")}</h2><div className="mt-2 divide-y divide-border/70">{detail.ingredients.map((item) => <div key={item.id} className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm"><span className="flex items-center gap-1.5"><bdi dir="auto">{item.ingredient_name}</bdi>{item.verified ? <ShieldCheck className="h-3.5 w-3.5" aria-label={nt("plaivraVerified")} /> : null}</span><span className="shrink-0 text-muted-foreground">{item.quantity ?? nt("asNeeded")}{item.quantity !== null && item.unit ? <> <bdi dir="auto">{item.unit}</bdi></> : null}</span></div>)}</div></section>
      <section aria-labelledby="instructions-heading"><h2 id="instructions-heading" className="text-lg font-semibold">{nt("instructions")}</h2><ol className="mt-3 space-y-4">{detail.instructions.map((step, index) => <li key={step.id} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><div><p className="text-sm leading-6"><bdi dir="auto">{step.instruction}</bdi></p>{step.duration_seconds || step.heat_or_temperature || step.doneness_or_result_cue ? <p className="mt-1 text-xs text-muted-foreground">{[step.duration_seconds ? nt("minutesShort", { count: Math.round(step.duration_seconds / 60) }) : null, step.heat_or_temperature, step.doneness_or_result_cue].filter(Boolean).join(" · ")}</p> : null}</div></li>)}</ol></section>
      {detail.equipment.length ? <section aria-labelledby="equipment-heading"><h2 id="equipment-heading" className="text-lg font-semibold">{nt("equipment")}</h2><ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{detail.equipment.map((item) => <li key={item.id}><bdi dir="auto">{item.name}</bdi>{item.quantity ? ` · ${item.quantity}` : ""}</li>)}</ul></section> : null}
      {version.notes ? <section><h2 className="text-lg font-semibold">{nt("notes")}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"><bdi dir="auto">{version.notes}</bdi></p></section> : null}
    </article>
  );
}
