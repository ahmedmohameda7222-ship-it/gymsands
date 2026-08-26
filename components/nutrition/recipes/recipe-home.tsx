"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Plus, Search, Sparkles } from "lucide-react";

import { recipeApi } from "@/components/nutrition/recipes/recipe-api";
import { RecipeRow } from "@/components/nutrition/recipes/recipe-row";
import { RecentlyDeletedRecipes } from "@/components/nutrition/recipes/recently-deleted-recipes";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import { qualifiesForObjectiveRecipeFilter } from "@/lib/nutrition-v1/recipe-cache";
import type { RecipeHomeRecord } from "@/services/nutrition-v1/server/recipe-workspace";

export function RecipeHome() {
  const router = useRouter();
  const { nt, language, dir } = useNutritionV1Translation();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RecipeHomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [draftOnly, setDraftOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ingredientFilter, setIngredientFilter] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [highProtein, setHighProtein] = useState(false);
  const [lowCarb, setLowCarb] = useState(false);

  const load = useCallback(async (search = query) => {
    setLoading(true);
    try {
      const result = await recipeApi<{ recipes: RecipeHomeRecord[] }>(`?q=${encodeURIComponent(search)}&limit=24`);
      setRows(result.recipes);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : nt("recipesLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [nt, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(query); }, 220);
    return () => window.clearTimeout(timer);
  }, [query, load]);

  async function create(mode: "manual" | "create" | "import") {
    try {
      const result = await recipeApi<{ recipeId: string }>("", { method: "POST", body: JSON.stringify({}) });
      const suffix = mode === "manual" ? "" : `?assistant=${mode}`;
      router.push(`/my-recipes/${result.recipeId}/edit${suffix}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : nt("recipeDraftCreateFailed"));
    }
  }

  const filtered = useMemo(() => rows.filter((recipe) => {
    if (favoriteOnly && !recipe.favorite) return false;
    if (draftOnly && recipe.status !== "draft") return false;
    if (maxTime && (recipe.totalTimeMinutes === null || recipe.totalTimeMinutes > Number(maxTime))) return false;
    if (cuisine.trim() && recipe.cuisine?.toLocaleLowerCase() !== cuisine.trim().toLocaleLowerCase()) return false;
    if (highProtein && !qualifiesForObjectiveRecipeFilter("high-protein", recipe.nutritionPerServing)) return false;
    if (lowCarb && !qualifiesForObjectiveRecipeFilter("low-carb", recipe.nutritionPerServing)) return false;
    if (ingredientFilter.trim()) return false;
    return true;
  }), [rows, favoriteOnly, draftOnly, maxTime, cuisine, highProtein, lowCarb, ingredientFilter]);

  const continueRows = rows.filter((row) => row.status === "draft").slice(0, 2);
  const recentRows = [...rows].filter((row) => row.lastUsedAt).sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt))).slice(0, 4);
  const favoriteRows = rows.filter((row) => row.favorite).slice(0, 4);

  function section(title: string, items: RecipeHomeRecord[]) {
    if (!items.length) return null;
    return (
      <section aria-labelledby={`recipe-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <h2 id={`recipe-${title.toLowerCase().replace(/\s+/g, "-")}`} className="mb-2 text-base font-semibold">{title}</h2>
        <div className="grid gap-2 md:grid-cols-2">{items.map((recipe) => <RecipeRow key={recipe.recipeId} recipe={recipe} />)}</div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 lg:px-8" dir={dir} lang={language}>
      <header className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{nt("nutrition")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{nt("myRecipes")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void create("manual")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />{nt("createManually")}</button>
          <button type="button" onClick={() => void create("create")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Sparkles className="h-4 w-4" />{nt("createWithChatGpt")}</button>
          <button type="button" onClick={() => void create("import")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Sparkles className="h-4 w-4" />{nt("importWithChatGpt")}</button>
        </div>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex min-h-11 flex-1 items-center">
          <Search className="pointer-events-none absolute start-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{nt("searchRecipes")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={nt("searchRecipes")} className="h-11 w-full rounded-xl border border-border bg-background ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <button type="button" onClick={() => setFavoriteOnly((value) => !value)} aria-pressed={favoriteOnly} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("favorites")}</button>
        <button type="button" onClick={() => setDraftOnly((value) => !value)} aria-pressed={draftOnly} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("drafts")}</button>
        <button type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Filter className="h-4 w-4" />{nt("filters")}</button>
      </div>

      {filtersOpen ? (
        <section className="rounded-2xl border border-border/70 p-4" aria-label={nt("filters")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">{nt("ingredients")}<input value={ingredientFilter} onChange={(event) => setIngredientFilter(event.target.value)} placeholder={nt("ingredient")} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
            <label className="text-sm font-medium">{nt("totalTime")}<input inputMode="numeric" value={maxTime} onChange={(event) => setMaxTime(event.target.value.replace(/\D/g, ""))} placeholder={nt("maxMinutes")} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
            <label className="text-sm font-medium">{nt("cuisine")}<input value={cuisine} onChange={(event) => setCuisine(event.target.value)} placeholder={nt("cuisine")} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
            <div className="flex items-end gap-2">
              <button type="button" aria-pressed={highProtein} onClick={() => setHighProtein((value) => !value)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("highProtein")}</button>
              <button type="button" aria-pressed={lowCarb} onClick={() => setLowCarb((value) => !value)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{nt("lowCarb")}</button>
            </div>
          </div>
          {ingredientFilter.trim() ? <p className="mt-3 text-xs text-muted-foreground">{nt("ingredientFilterPending")}</p> : null}
        </section>
      ) : null}

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {loading ? <div className="space-y-2" aria-label={nt("loadingRecipes")}>{[0, 1, 2].map((item) => <div key={item} className="h-[84px] animate-pulse rounded-2xl bg-muted" />)}</div> : null}

      {!loading ? (
        <div className="space-y-7">
          {section(nt("continue"), continueRows)}
          {section(nt("recentlyUsed"), recentRows)}
          {section(nt("favorites"), favoriteRows)}
          <section aria-labelledby="all-recipes-heading">
            <div className="mb-2 flex items-center justify-between gap-3"><h2 id="all-recipes-heading" className="text-base font-semibold">{nt("allRecipes")}</h2><span className="text-xs text-muted-foreground">{nt("shownCount", { count: filtered.length })}</span></div>
            {filtered.length ? <div className="grid gap-2 md:grid-cols-2">{filtered.map((recipe) => <RecipeRow key={recipe.recipeId} recipe={recipe} />)}</div> : <div className="rounded-2xl border border-dashed border-border p-8 text-center"><p className="font-medium">{nt("noMatchingRecipes")}</p><p className="mt-1 text-sm text-muted-foreground">{nt("recipeSearchHint")}</p></div>}
          </section>
        </div>
      ) : null}

      <RecentlyDeletedRecipes onChange={() => void load()} />
    </div>
  );
}
