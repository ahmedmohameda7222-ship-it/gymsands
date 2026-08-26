"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { recipeApi } from "@/components/nutrition/recipes/recipe-api";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

type DeletedRecipe = { id: string; name: string; cover_path: string | null; deleted_at: string; purge_after: string };

const recoveryCopy = {
  en: {
    title: "Recently Deleted",
    description: "Deleted Recipes stay recoverable for 30 days unless you choose Delete Now.",
    loading: "Loading…",
    empty: "Nothing is waiting for recovery.",
    recoveryEnds: "Recovery ends {date}",
    restore: "Restore",
    deleteNow: "Delete Now",
    loadError: "Recently Deleted could not be loaded.",
  },
  de: {
    title: "Kürzlich gelöscht",
    description: "Gelöschte Rezepte bleiben 30 Tage wiederherstellbar, außer du wählst Jetzt löschen.",
    loading: "Wird geladen…",
    empty: "Es wartet nichts auf Wiederherstellung.",
    recoveryEnds: "Wiederherstellung endet am {date}",
    restore: "Wiederherstellen",
    deleteNow: "Jetzt löschen",
    loadError: "Kürzlich gelöschte Rezepte konnten nicht geladen werden.",
  },
  ar: {
    title: "المحذوفة مؤخرًا",
    description: "تظل الوصفات المحذوفة قابلة للاستعادة لمدة 30 يومًا ما لم تختر الحذف الآن.",
    loading: "جارٍ التحميل…",
    empty: "لا توجد وصفات في انتظار الاستعادة.",
    recoveryEnds: "تنتهي الاستعادة في {date}",
    restore: "استعادة",
    deleteNow: "الحذف الآن",
    loadError: "تعذر تحميل الوصفات المحذوفة مؤخرًا.",
  },
} as const;

export function RecentlyDeletedRecipes({ onChange }: { onChange?: () => void }) {
  const { language, dir, locale } = useNutritionV1Translation();
  const copy = recoveryCopy[language];
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
      setError(cause instanceof Error ? cause.message : recoveryCopy[language].loadError);
    } finally {
      setLoading(false);
    }
  }, [language]);

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
    <section className="rounded-2xl border border-border/70 bg-background p-4" aria-labelledby="recently-deleted-title" dir={dir}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="recently-deleted-title" className="text-base font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
        </div>
      </div>
      {loading ? <p className="mt-4 text-sm text-muted-foreground">{copy.loading}</p> : null}
      {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
      {!loading && !error && !rows.length ? <p className="mt-4 text-sm text-muted-foreground">{copy.empty}</p> : null}
      <div className="mt-3 divide-y divide-border/70">
        {rows.map((recipe) => {
          const recoveryDate = new Intl.DateTimeFormat(locale).format(new Date(recipe.purge_after));
          return (
            <div key={recipe.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium"><bdi dir="auto">{recipe.name}</bdi></p>
                <p className="text-xs text-muted-foreground">{copy.recoveryEnds.replace("{date}", recoveryDate)}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => void restore(recipe.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted" aria-label={`${copy.restore} ${recipe.name}`}><RotateCcw className="h-4 w-4" />{copy.restore}</button>
                <button type="button" onClick={() => void purge(recipe.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-destructive hover:bg-destructive/10" aria-label={`${copy.deleteNow} ${recipe.name}`}><Trash2 className="h-4 w-4" />{copy.deleteNow}</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
