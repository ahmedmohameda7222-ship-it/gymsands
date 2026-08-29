"use client";

import { useEatTranslation } from "@/lib/i18n/eat";

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

const copy = {
  en: { plate: "Plate", item: "item", items: "items", log: "Log", quantityFor: "Quantity for {name}", remove: "Remove" },
  de: { plate: "Teller", item: "Eintrag", items: "Einträge", log: "Protokollieren", quantityFor: "Menge für {name}", remove: "Entfernen" },
  ar: { plate: "الطبق", item: "عنصر", items: "عناصر", log: "تسجيل", quantityFor: "الكمية لـ {name}", remove: "إزالة" },
} as const;

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
  const { et, language, dir } = useEatTranslation();
  if (!plate.length) return null;
  const text = copy[language];
  const knownCalories = plate.every((item) => item.nutrition.caloriesKcal !== null)
    ? plate.reduce((sum, item) => sum + (item.nutrition.caloriesKcal ?? 0), 0)
    : null;
  const itemLabel = plate.length === 1 ? text.item : text.items;
  return (
    <aside dir={dir} className="sticky bottom-3 z-20 mt-5 rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur" aria-label={text.plate}>
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-semibold">{text.plate}</p><p className="text-xs text-muted-foreground">{plate.length} {itemLabel}{knownCalories === null ? "" : ` · ${Math.round(knownCalories)} kcal`}</p></div>
        <button type="button" onClick={onSubmit} disabled={pending} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">{pending ? et("logging") : `${text.log} ${plate.length} ${itemLabel}`}</button>
      </div>
      <div className="mt-3 divide-y divide-border">
        {plate.map((item) => <div key={item.id} className="flex min-h-14 items-center gap-3 py-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium"><bdi dir="auto">{item.foodName}</bdi></p><p className="text-xs text-muted-foreground"><bdi dir="auto">{item.servingLabel}</bdi></p></div>
          <label className="text-xs text-muted-foreground">{et("quantity")} <input aria-label={text.quantityFor.replace("{name}", item.foodName)} type="number" min="0.1" step="0.1" value={item.quantity} onChange={(event) => onQuantityChange(item.id, Number(event.target.value))} className="ms-1 w-20 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" /></label>
          <button type="button" onClick={() => onRemove(item.id)} className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-muted">{text.remove}</button>
        </div>)}
      </div>
    </aside>
  );
}
