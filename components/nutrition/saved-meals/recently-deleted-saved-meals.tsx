"use client";

import { Button } from "@/components/ui/button";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

export type RecentlyDeletedSavedMealItem = { id: string; name: string; deletedAtLabel: string; purgeAfterLabel: string; };
export type RecentlyDeletedSavedMealsProps = { items: RecentlyDeletedSavedMealItem[]; onRestore: (id: string) => void; onDeleteNow: (id: string) => void; busyId?: string | null; };

export function RecentlyDeletedSavedMeals({ items, onRestore, onDeleteNow, busyId = null }: RecentlyDeletedSavedMealsProps) {
  const { nt, dir } = useNutritionV1Translation();
  return (
    <section dir={dir} data-saved-meal-contextual="recently-deleted" className="space-y-3" aria-labelledby="recently-deleted-saved-meals-heading">
      <div className="space-y-1"><h2 id="recently-deleted-saved-meals-heading" className="text-lg font-semibold text-foreground">{nt("recentlyDeleted")}</h2><p className="text-sm text-muted-foreground">{nt("savedMealRecoveryDescription")}</p></div>
      {items.length ? <ul className="divide-y divide-border border-y border-border">{items.map((item) => { const busy = busyId === item.id; return <li key={item.id} className="space-y-3 py-3.5"><div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground"><bdi dir="auto">{item.name}</bdi></div><div className="mt-0.5 text-xs text-muted-foreground"><bdi dir="auto">{item.deletedAtLabel}</bdi></div><div className="text-xs text-muted-foreground"><bdi dir="auto">{item.purgeAfterLabel}</bdi></div></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => onRestore(item.id)} disabled={busy}>{nt("restore")}</Button><Button type="button" variant="destructive" onClick={() => onDeleteNow(item.id)} disabled={busy}>{nt("deleteNow")}</Button></div></li>; })}</ul> : <p className="border-y border-border py-5 text-sm text-muted-foreground">{nt("nothingRecentlyDeleted")}</p>}
    </section>
  );
}
