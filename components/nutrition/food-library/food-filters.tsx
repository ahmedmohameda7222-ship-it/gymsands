"use client";

import { Info, X } from "lucide-react";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

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

export function FoodFilters({ value, onChange, onClose }: { value: FoodLibraryFilterState; onChange: (next: FoodLibraryFilterState) => void; onClose: () => void; }) {
  const { nt, dir } = useNutritionV1Translation();
  const update = (patch: Partial<FoodLibraryFilterState>) => onChange({ ...value, ...patch });
  return (
    <aside dir={dir} className="rounded-2xl border border-border bg-background p-4" aria-label={nt("foodFilters")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{nt("filters")}</h2>
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted"><X className="h-4 w-4" />{nt("closeFilters")}</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" aria-pressed={value.highProtein} onClick={() => update({ highProtein: !value.highProtein })} className="min-h-11 rounded-full border border-border px-4 text-sm aria-pressed:bg-foreground aria-pressed:text-background">{nt("highProtein")}</button>
        <button type="button" aria-pressed={value.lowCarb} onClick={() => update({ lowCarb: !value.lowCarb })} className="min-h-11 rounded-full border border-border px-4 text-sm aria-pressed:bg-foreground aria-pressed:text-background">{nt("lowCarb")}</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">{nt("proteinMinimum")}
          <div className="mt-1 flex min-h-[45px] items-center rounded-xl border border-border px-3"><input inputMode="decimal" value={value.proteinMin} onChange={(event) => update({ proteinMin: event.target.value })} placeholder="g / 100" className="min-h-[45px] w-full bg-transparent text-sm outline-none" /></div>
        </label>
        <label className="text-xs font-medium text-muted-foreground">{nt("carbsMaximum")}
          <div className="mt-1 flex min-h-[45px] items-center rounded-xl border border-border px-3"><input inputMode="decimal" value={value.carbsMax} onChange={(event) => update({ carbsMax: event.target.value })} placeholder="g / 100" className="min-h-[45px] w-full bg-transparent text-sm outline-none" /></div>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{nt("normalizedFilterHint")}</p>
      <details className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground"><summary className="flex cursor-pointer items-center gap-2 font-medium text-foreground"><Info className="h-4 w-4" />{nt("info")}</summary><p className="mt-2 leading-5">{nt("nutritionFilterInfo")}</p></details>
      <button type="button" onClick={() => onChange(emptyFoodLibraryFilters)} className="mt-4 min-h-11 rounded-xl px-3 text-sm font-medium underline underline-offset-4">{nt("resetFilters")}</button>
    </aside>
  );
}
