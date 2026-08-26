"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { recipeApi } from "@/components/nutrition/recipes/recipe-api";

type DeletedRecipe = { id: string; name: string; cover_path: string | null; deleted_at: string; purge_after: string };

export function RecentlyDeletedRecipes({ onChange }: { onChange?: () => void }) {
  const [rows, setRows] = useState<DeletedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await recipeApi<{ recipes: DeletedRecipe[] }>("?deleted=true&limit=20");
      setRows(result.recipes);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recently Deleted could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function restore(id: string) {
    await recipeApi(`/${id}/restore`, { method: "POST" });
    await load();
    onChange?.();
  }

  async function purge(id: string) {
    await recipeApi(`/${id}/purge`, { method: "DELETE" });
    await load();
    onChange?.();
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-background p-4" aria-labelledby="recently-deleted-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="recently-deleted-title" className="text-base font-semibold">Recently Deleted</h2>
          <p className="mt-1 text-sm text-muted-foreground">Deleted Recipes stay recoverable for 30 days unless you choose Delete Now.</p>
        </div>
      </div>
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
      {!loading && !error && !rows.length ? <p className="mt-4 text-sm text-muted-foreground">Nothing is waiting for recovery.</p> : null}
      <div className="mt-3 divide-y divide-border/70">
        {rows.map((recipe) => (
          <div key={recipe.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{recipe.name}</p>
              <p className="text-xs text-muted-foreground">Recovery ends {new Date(recipe.purge_after).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => void restore(recipe.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted" aria-label={`Restore ${recipe.name}`}><RotateCcw className="h-4 w-4" />Restore</button>
              <button type="button" onClick={() => void purge(recipe.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-destructive hover:bg-destructive/10" aria-label={`Delete ${recipe.name} now`}><Trash2 className="h-4 w-4" />Delete Now</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
