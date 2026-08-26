"use client";

import { Info, X } from "lucide-react";

export type FoodLibraryFilterState = {
  highProtein: boolean;
  lowCarb: boolean;
  proteinMin: string;
  carbsMax: string;
};

export const emptyFoodLibraryFilters: FoodLibraryFilterState = {
  highProtein: false,
  lowCarb: false,
  proteinMin: "",
  carbsMax: "",
};

export function FoodFilters({
  value,
  onChange,
  onClose,
}: {
  value: FoodLibraryFilterState;
  onChange: (next: FoodLibraryFilterState) => void;
  onClose: () => void;
}) {
  const update = (patch: Partial<FoodLibraryFilterState>) => onChange({ ...value, ...patch });
  return (
    <aside className="rounded-2xl border border-border bg-background p-4" aria-label="Food filters">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Filters</h2>
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted"><X className="h-4 w-4" />Close Filters</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" aria-pressed={value.highProtein} onClick={() => update({ highProtein: !value.highProtein })} className="min-h-11 rounded-full border border-border px-4 text-sm aria-pressed:bg-foreground aria-pressed:text-background">High Protein</button>
        <button type="button" aria-pressed={value.lowCarb} onClick={() => update({ lowCarb: !value.lowCarb })} className="min-h-11 rounded-full border border-border px-4 text-sm aria-pressed:bg-foreground aria-pressed:text-background">Low Carb</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">Protein ≥
          <div className="mt-1 flex min-h-11 items-center rounded-xl border border-border px-3"><input inputMode="decimal" value={value.proteinMin} onChange={(event) => update({ proteinMin: event.target.value })} placeholder="g / 100" className="w-full bg-transparent text-sm outline-none" /></div>
        </label>
        <label className="text-xs font-medium text-muted-foreground">Carbs ≤
          <div className="mt-1 flex min-h-11 items-center rounded-xl border border-border px-3"><input inputMode="decimal" value={value.carbsMax} onChange={(event) => update({ carbsMax: event.target.value })} placeholder="g / 100" className="w-full bg-transparent text-sm outline-none" /></div>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Numeric filters support ≥, ≤, and Between ranges. Foods with unknown values do not match an objective nutrition filter.</p>
      <details className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground"><summary className="flex cursor-pointer items-center gap-2 font-medium text-foreground"><Info className="h-4 w-4" />Info</summary><p className="mt-2 leading-5">About nutrition filter values: filters use known normalized nutrition only. Missing values stay unknown.</p></details>
      <button type="button" onClick={() => onChange(emptyFoodLibraryFilters)} className="mt-4 min-h-11 rounded-xl px-3 text-sm font-medium underline underline-offset-4">Reset filters</button>
    </aside>
  );
}
