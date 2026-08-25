"use client";

import { Button } from "@/components/ui/button";

export type SavedMealEditorItem = {
  id: string;
  kind: "food" | "recipe";
  name: string;
  servingLabel: string;
};

export type SavedMealEditorProps = {
  mode: "create" | "edit";
  name: string;
  note: string;
  items: SavedMealEditorItem[];
  onNameChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onAddFood: () => void;
  onAddRecipe: () => void;
  onRemoveItem: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
};

export function SavedMealEditor({
  mode,
  name,
  note,
  items,
  onNameChange,
  onNoteChange,
  onAddFood,
  onAddRecipe,
  onRemoveItem,
  onSave,
  onCancel,
  busy = false,
  error = null,
}: SavedMealEditorProps) {
  const heading = mode === "create" ? "Create Saved Meal" : "Edit Saved Meal";

  return (
    <section data-saved-meal-contextual="editor" className="space-y-5" aria-labelledby="saved-meal-editor-heading">
      <div className="space-y-1">
        <h2 id="saved-meal-editor-heading" className="text-lg font-semibold text-foreground">
          {heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          Combine Foods and published Recipes for reuse in Diary or Meal Plan.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="saved-meal-name" className="text-sm font-medium text-foreground">
          Name
        </label>
        <input
          id="saved-meal-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={200}
          disabled={busy}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="saved-meal-note" className="text-sm font-medium text-foreground">
          Note <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="saved-meal-note"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          disabled={busy}
          rows={3}
          className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Items</h3>
          <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "item" : "items"}</span>
        </div>

        {items.length ? (
          <ul className="divide-y divide-border border-y border-border">
            {items.map((item) => (
              <li key={item.id} className="flex min-h-14 items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.kind === "food" ? "Food" : "Recipe"}
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">{item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.servingLabel}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onRemoveItem(item.id)}
                  disabled={busy}
                  aria-label={`Remove ${item.name}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            Add at least one Food or Recipe.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onAddFood} disabled={busy}>
            Add Food
          </Button>
          <Button type="button" variant="outline" onClick={onAddRecipe} disabled={busy}>
            Add Recipe
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={busy || !name.trim() || items.length === 0}>
          {busy ? "Saving…" : "Save Saved Meal"}
        </Button>
      </div>
    </section>
  );
}
