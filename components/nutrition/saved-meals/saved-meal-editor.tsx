"use client";

import { Button } from "@/components/ui/button";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

export type SavedMealEditorItem = { id: string; kind: "food" | "recipe"; name: string; servingLabel: string; };
export type SavedMealEditorProps = {
  mode: "create" | "edit"; name: string; note: string; items: SavedMealEditorItem[];
  onNameChange: (value: string) => void; onNoteChange: (value: string) => void; onAddFood: () => void; onAddRecipe: () => void;
  onRemoveItem: (id: string) => void; onSave: () => void; onCancel: () => void; busy?: boolean; error?: string | null;
};

export function SavedMealEditor({ mode, name, note, items, onNameChange, onNoteChange, onAddFood, onAddRecipe, onRemoveItem, onSave, onCancel, busy = false, error = null }: SavedMealEditorProps) {
  const { nt, dir } = useNutritionV1Translation();
  const heading = nt(mode === "create" ? "createSavedMeal" : "editSavedMeal");
  return (
    <section dir={dir} data-saved-meal-contextual="editor" className="space-y-5" aria-labelledby="saved-meal-editor-heading">
      <div className="space-y-1"><h2 id="saved-meal-editor-heading" className="text-lg font-semibold text-foreground">{heading}</h2><p className="text-sm text-muted-foreground">{nt("savedMealDescription")}</p></div>
      <div className="space-y-2"><label htmlFor="saved-meal-name" className="text-sm font-medium text-foreground">{nt("name")}</label><input id="saved-meal-name" value={name} onChange={(event) => onNameChange(event.target.value)} maxLength={200} disabled={busy} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" /></div>
      <div className="space-y-2"><label htmlFor="saved-meal-note" className="text-sm font-medium text-foreground">{nt("noteOptional")}</label><textarea id="saved-meal-note" value={note} onChange={(event) => onNoteChange(event.target.value)} disabled={busy} rows={3} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" /></div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-foreground">{nt("items")}</h3><span className="text-xs text-muted-foreground">{items.length} {nt(items.length === 1 ? "itemSingular" : "itemPlural")}</span></div>
        {items.length ? <ul className="divide-y divide-border border-y border-border">{items.map((item) => <li key={item.id} className="flex min-h-14 items-center gap-3 py-2.5"><div className="min-w-0 flex-1"><div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{nt(item.kind === "food" ? "food" : "recipe")}</div><div className="truncate text-sm font-medium text-foreground"><bdi dir="auto">{item.name}</bdi></div><div className="truncate text-xs text-muted-foreground"><bdi dir="auto">{item.servingLabel}</bdi></div></div><Button type="button" variant="ghost" onClick={() => onRemoveItem(item.id)} disabled={busy} aria-label={nt("removeNamed", { name: item.name })}>{nt("remove")}</Button></li>)}</ul> : <p className="border-y border-border py-5 text-sm text-muted-foreground">{nt("addAtLeastOne")}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onAddFood} disabled={busy}>{nt("addFood")}</Button><Button type="button" variant="outline" onClick={onAddRecipe} disabled={busy}>{nt("addRecipe")}</Button></div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{nt("cancel")}</Button><Button type="button" onClick={onSave} disabled={busy || !name.trim() || items.length === 0}>{busy ? nt("saving") : nt("saveSavedMeal")}</Button></div>
    </section>
  );
}
