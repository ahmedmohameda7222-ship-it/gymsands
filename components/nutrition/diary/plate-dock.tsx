"use client";

export type DiaryPlateNutrition = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type DiaryPlateSource =
  | { type: "food"; id: string | null; frozenSnapshot: Record<string, unknown> }
  | { type: "recipe"; id: string; recipeVersionId: string; frozenSnapshot: Record<string, unknown> }
  | { type: "saved_meal"; id: string; frozenSnapshot: Record<string, unknown> }
  | { type: "planned_occurrence"; id: string; frozenSnapshot: Record<string, unknown> }
  | { type: "quick_add"; frozenSnapshot: Record<string, unknown> };

export type DiaryPlateItem = {
  id: string;
  foodName: string;
  servingLabel: string;
  quantity: number;
  nutrition: DiaryPlateNutrition;
  foodItemId?: string | null;
  userFoodItemId?: string | null;
  notes?: string | null;
  source: DiaryPlateSource;
};

export function PlateDock({
  plate,
  pending,
  onQuantityChange,
  onRemove,
  onSubmit,
}: {
  plate: DiaryPlateItem[];
  pending: boolean;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  if (!plate.length) return null;
  const knownCalories = plate.every((item) => item.nutrition.caloriesKcal !== null)
    ? plate.reduce((sum, item) => sum + (item.nutrition.caloriesKcal ?? 0), 0)
    : null;
  return (
    <aside className="sticky bottom-3 z-20 mt-5 rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur" aria-label="Plate">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-semibold">Plate</p><p className="text-xs text-muted-foreground">{plate.length} {plate.length === 1 ? "item" : "items"}{knownCalories === null ? "" : ` · ${Math.round(knownCalories)} kcal`}</p></div>
        <button type="button" onClick={onSubmit} disabled={pending} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">{pending ? "Logging…" : `Log ${plate.length} ${plate.length === 1 ? "item" : "items"}`}</button>
      </div>
      <div className="mt-3 divide-y divide-border">
        {plate.map((item) => <div key={item.id} className="flex min-h-14 items-center gap-3 py-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.foodName}</p><p className="text-xs text-muted-foreground">{item.servingLabel}</p></div>
          <label className="text-xs text-muted-foreground">quantity <input aria-label={`Quantity for ${item.foodName}`} type="number" min="0.1" step="0.1" value={item.quantity} onChange={(event) => onQuantityChange(item.id, Number(event.target.value))} className="ml-1 w-20 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" /></label>
          <button type="button" onClick={() => onRemove(item.id)} className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-muted">Remove</button>
        </div>)}
      </div>
    </aside>
  );
}
