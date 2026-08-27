"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Plus, ScanLine, Search } from "lucide-react";

import { BarcodeLookup } from "@/components/nutrition/food-library/barcode-lookup";
import { CustomFoodWorkspace } from "@/components/nutrition/food-library/custom-food-workspace";
import { FoodDetail } from "@/components/nutrition/food-library/food-detail";
import { foodLibraryText, type FoodLibraryTextKey } from "@/components/nutrition/food-library/food-library-copy";
import { FoodFilters, emptyFoodLibraryFilters, type FoodLibraryFilterState } from "@/components/nutrition/food-library/food-filters";
import { FoodRow } from "@/components/nutrition/food-library/food-row";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { FoodLibraryCandidate, FoodLibraryPage as FoodLibraryResponse } from "@/services/nutrition-v1/server/food-library";

type QuickScope = "all" | "favorites" | "recent" | "my_food";
type WorkspaceState = { mode: "create" | "edit" | "correction"; food: FoodLibraryCandidate | null };

export function FoodLibraryPage() {
  const { nt: baseNt, language, dir } = useNutritionV1Translation();
  const nt = useCallback((key: FoodLibraryTextKey, values?: Record<string, string | number>) => foodLibraryText(language, baseNt, key, values), [baseNt, language]);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<QuickScope>("all");
  const [filters, setFilters] = useState<FoodLibraryFilterState>(emptyFoodLibraryFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [rows, setRows] = useState<FoodLibraryCandidate[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ food: FoodLibraryCandidate; add: boolean } | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = useCallback((cursor?: string | null) => {
    const search = new URLSearchParams({ q: query, locale: language, limit: "20", scope });
    if (cursor) search.set("cursor", cursor);
    if (category) search.set("category", category);
    if (cuisine) search.set("cuisine", cuisine);
    if (filters.highProtein) search.append("preset", "high-protein");
    if (filters.lowCarb) search.append("preset", "low-carb");
    if (filters.proteinMin) search.set("proteinMin", filters.proteinMin);
    if (filters.carbsMax) search.set("carbsMax", filters.carbsMax);
    return search;
  }, [category, cuisine, filters, language, query, scope]);

  const load = useCallback(async (cursor?: string | null, append = false, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/nutrition/v1/foods?${params(cursor).toString()}`, { signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(nt("foodLibraryLoadFailed"));
      const data = await response.json() as FoodLibraryResponse;
      setRows((current) => append ? [...current, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : nt("foodLibraryLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [nt, params]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(null, false, controller.signal); }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const categories = useMemo(() => Array.from(new Set(rows.map((food) => food.category).filter((value): value is string => Boolean(value)))).sort(), [rows]);
  const cuisines = useMemo(() => Array.from(new Set(rows.map((food) => food.cuisine).filter((value): value is string => Boolean(value)))).sort(), [rows]);

  async function toggleFavorite(food: FoodLibraryCandidate) {
    if (food.source !== "catalog") return;
    const favorite = !food.favorite;
    setRows((current) => current.map((row) => row.id === food.id && row.source === food.source ? { ...row, favorite } : row));
    const response = await fetch("/api/nutrition/v1/foods", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ foodId: food.id, favorite }) });
    if (!response.ok) void load();
  }

  function openWorkspace(mode: WorkspaceState["mode"], food: FoodLibraryCandidate | null = null) {
    setSelected(null);
    setWorkspace({ mode, food });
  }

  function finishWorkspace() {
    setWorkspace(null);
    setSelected(null);
    void load();
  }

  const quick = (next: QuickScope) => { setScope(next); setCategory(""); setCuisine(""); };
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6" dir={dir} lang={language}>
      <header className="border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{nt("foodLibrary")}</h1><p className="mt-1 text-sm text-muted-foreground">{nt("foodLibraryDescription")}</p></div><div className="flex gap-2"><button type="button" onClick={() => setBarcodeOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><ScanLine className="h-4 w-4" />{nt("scanBarcode")}</button><button type="button" onClick={() => openWorkspace("create")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-3 text-sm font-semibold text-background"><Plus className="h-4 w-4" />{nt("createFood")}</button></div></div>
        <div className="mt-4 flex gap-2"><label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3"><Search className="h-4 w-4 text-muted-foreground" /><span className="sr-only">{nt("searchFoods")}</span><input value={query} onChange={(event) => { setQuery(event.target.value); setScope("all"); }} placeholder={nt("searchFoods")} className="min-h-11 w-full bg-transparent text-sm outline-none" /></label><button type="button" onClick={() => setFiltersOpen((open) => !open)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"><Filter className="h-4 w-4" />{nt("filters")}</button></div>
      </header>

      {filtersOpen ? <div className="mt-4"><FoodFilters value={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} /></div> : null}

      {!query ? <section className="mt-5 space-y-4" aria-label={nt("quickAccess")}><div><h2 className="text-sm font-semibold">{nt("quickAccess")}</h2><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => quick("recent")} aria-pressed={scope === "recent"} className="min-h-11 rounded-full border border-border px-4 text-sm aria-pressed:bg-foreground aria-pressed:text-background">{nt("recent")}</button><button type="button" onClick={() => quick("favorites")} aria-pressed={scope === "favorites"} className="min-h-11 rounded-full border border-border px-4 text-sm aria-pressed:bg-foreground aria-pressed:text-background">{nt("favorites")}</button><button type="button" onClick={() => quick("my_food")} aria-pressed={scope === "my_food"} className="min-h-11 rounded-full border border-border px-4 text-sm aria-pressed:bg-foreground aria-pressed:text-background">{nt("myFoods")}</button></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nt("browseByCategory")}</h3><div className="mt-2 flex flex-wrap gap-2">{categories.length ? categories.map((item) => <button key={item} type="button" onClick={() => { setCategory(category === item ? "" : item); setScope("all"); }} className="min-h-11 rounded-lg px-3 text-sm underline-offset-4 hover:underline"><bdi dir="auto">{item}</bdi></button>) : <span className="text-sm text-muted-foreground">{nt("categoriesAppear")}</span>}</div></div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nt("browseByCuisine")}</h3><div className="mt-2 flex flex-wrap gap-2">{cuisines.length ? cuisines.map((item) => <button key={item} type="button" onClick={() => { setCuisine(cuisine === item ? "" : item); setScope("all"); }} className="min-h-11 rounded-lg px-3 text-sm underline-offset-4 hover:underline"><bdi dir="auto">{item}</bdi></button>) : <span className="text-sm text-muted-foreground">{nt("cuisineAppears")}</span>}</div></div></div>
      </section> : null}

      {error ? <p className="mt-5 rounded-xl border border-destructive/30 p-4 text-sm text-destructive" role="alert">{error}</p> : null}
      <section className="mt-5" aria-live="polite">{loading && !rows.length ? <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[88px] animate-pulse rounded-xl bg-muted" />)}</div> : rows.length ? <div className="grid gap-x-5 lg:grid-cols-2">{rows.map((food) => <FoodRow key={`${food.source}:${food.id}`} food={food} onOpen={() => setSelected({ food, add: false })} onAdd={() => setSelected({ food, add: true })} onFavorite={() => void toggleFavorite(food)} />)}</div> : !loading ? <div className="py-12 text-center"><p className="text-sm font-medium">{nt("noMatchingFoods")}</p><p className="mt-1 text-sm text-muted-foreground">{nt("clearFilterHint")}</p></div> : null}</section>
      {nextCursor ? <div className="mt-5 flex justify-center"><button type="button" disabled={loading} onClick={() => void load(nextCursor, true)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">{loading ? nt("loading") : nt("loadMore")}</button></div> : null}
      {selected ? <FoodDetail food={selected.food} initialAdd={selected.add} onClose={() => setSelected(null)} onCorrect={(food) => openWorkspace("correction", food)} onEdit={(food) => openWorkspace("edit", food)} onDelete={(food) => openWorkspace("edit", food)} /> : null}
      {workspace ? <CustomFoodWorkspace mode={workspace.mode} food={workspace.food} onClose={() => setWorkspace(null)} onSaved={finishWorkspace} /> : null}
      {barcodeOpen ? <BarcodeLookup onClose={() => setBarcodeOpen(false)} onSeedSearch={(name) => { setQuery(name); setScope("all"); }} /> : null}
    </main>
  );
}