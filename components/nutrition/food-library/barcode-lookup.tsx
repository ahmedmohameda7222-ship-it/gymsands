"use client";

import { useCallback, useState } from "react";
import { ScanLine, X } from "lucide-react";

import { foodLibraryText, type FoodLibraryTextKey } from "@/components/nutrition/food-library/food-library-copy";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

type BarcodeFood = { name?: string | null; barcode?: string | null };

export function BarcodeLookup({ onClose, onSeedSearch }: { onClose: () => void; onSeedSearch: (name: string) => void }) {
  const { nt: baseNt, language, dir } = useNutritionV1Translation();
  const nt = useCallback((key: FoodLibraryTextKey, values?: Record<string, string | number>) => foodLibraryText(language, baseNt, key, values), [baseNt, language]);
  const [barcode, setBarcode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<BarcodeFood | null>(null);

  async function lookup() {
    const value = barcode.trim();
    if (!value) return;
    setPending(true);
    setError(null);
    setMatch(null);
    try {
      const response = await fetch(`/api/food/open-food-facts?barcode=${encodeURIComponent(value)}`);
      const result = await response.json().catch(() => ({})) as { food?: BarcodeFood | null };
      if (!response.ok || !result.food?.name) throw new Error(nt("barcodeLookupFailed"));
      setMatch(result.food);
    } catch {
      setError(nt("barcodeLookupFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div dir={dir} className="fixed inset-0 z-[60] flex justify-end bg-black/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={nt("barcodeLookup")} className="h-full w-full max-w-[480px] overflow-y-auto border-s border-border bg-background p-5 shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 pb-4"><div><p className="text-xs font-medium text-muted-foreground">{nt("foodLibrary")}</p><h2 className="flex items-center gap-2 text-xl font-semibold"><ScanLine className="h-5 w-5" />{nt("barcodeLookup")}</h2></div><button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label={nt("close")}><X className="h-5 w-5" /></button></header>
        <p className="mt-4 text-sm text-muted-foreground">{nt("barcodeLookupDescription")}</p>
        <label className="mt-5 block text-sm font-medium">{nt("barcode")}<input inputMode="numeric" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder={nt("enterBarcode")} className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
        <button type="button" disabled={pending || !barcode.trim()} onClick={() => void lookup()} className="mt-3 min-h-12 w-full rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">{pending ? nt("lookingUp") : nt("lookup")}</button>
        {error ? <div className="mt-5 rounded-xl border border-destructive/30 p-4" role="alert"><p className="text-sm font-medium text-destructive">{nt("barcodeLookupFailed")}</p><p className="mt-1 text-sm text-muted-foreground">{nt("searchStillAvailable")}</p></div> : null}
        {match?.name ? <div className="mt-5 rounded-xl border border-border p-4" role="status"><p className="font-medium"><bdi dir="auto">{match.name}</bdi></p><p className="mt-1 text-sm text-muted-foreground">{nt("barcodeMatched", { name: match.name })}</p><button type="button" className="mt-3 min-h-11 rounded-xl border border-border px-4 text-sm font-medium" onClick={() => { onSeedSearch(match.name as string); onClose(); }}>{nt("searchFoods")}</button></div> : null}
      </section>
    </div>
  );
}
