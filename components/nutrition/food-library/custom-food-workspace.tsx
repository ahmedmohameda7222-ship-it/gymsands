"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import { foodLibraryText, type FoodLibraryTextKey } from "@/components/nutrition/food-library/food-library-copy";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";

type Mode = "create" | "edit" | "correction";
type Duplicate = { id: string; food_name: string; serving_size: string; source: "catalog" | "my_food" };

type Props = {
  mode: Mode;
  food?: FoodLibraryCandidate | null;
  onClose: () => void;
  onSaved: () => void;
};

function nullableNumber(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const number = Number(clean);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function CustomFoodWorkspace({ mode, food = null, onClose, onSaved }: Props) {
  const { nt: baseNt, language, dir } = useNutritionV1Translation();
  const nt = useCallback((key: FoodLibraryTextKey, values?: Record<string, string | number>) => foodLibraryText(language, baseNt, key, values), [baseNt, language]);
  const [effectiveMode, setEffectiveMode] = useState<Mode>(mode);
  const [correctionTarget, setCorrectionTarget] = useState<Duplicate | null>(null);
  const [name, setName] = useState(food?.name ?? "");
  const [servingLabel, setServingLabel] = useState(food?.servingLabel ?? "100 g");
  const [calories, setCalories] = useState(food?.nutrition.calories === null ? "" : String(food?.nutrition.calories ?? ""));
  const [protein, setProtein] = useState(food?.nutrition.protein_g === null ? "" : String(food?.nutrition.protein_g ?? ""));
  const [carbs, setCarbs] = useState(food?.nutrition.carbs_g === null ? "" : String(food?.nutrition.carbs_g ?? ""));
  const [fat, setFat] = useState(food?.nutrition.fat_g === null ? "" : String(food?.nutrition.fat_g ?? ""));
  const [basisAmount, setBasisAmount] = useState(food?.nutrition.basis_amount === null ? "100" : String(food?.nutrition.basis_amount ?? 100));
  const [basisUnit, setBasisUnit] = useState<"g" | "ml" | "serving" | "piece" | "custom">(food?.nutrition.basis_unit ?? "g");
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = effectiveMode === "create" ? nt("createFood") : effectiveMode === "edit" ? nt("editFood") : nt("personalCorrection");
  const targetId = correctionTarget?.id ?? food?.id ?? null;
  const targetName = correctionTarget?.food_name ?? food?.name ?? name;
  const requiredCalories = effectiveMode !== "correction";
  const canSave = useMemo(() => {
    if (pending) return false;
    if (effectiveMode === "correction") return Boolean(targetId) && [calories, protein, carbs, fat].some((value) => value.trim());
    return Boolean(name.trim() && servingLabel.trim() && calories.trim() && Number.isFinite(Number(calories)) && Number(calories) >= 0);
  }, [calories, carbs, effectiveMode, fat, name, pending, protein, servingLabel, targetId]);

  async function submit(createSeparately = false) {
    if (!canSave && !createSeparately) return;
    setPending(true);
    setError(null);
    try {
      const operation = effectiveMode === "create" ? "custom_food_create" : effectiveMode === "edit" ? "custom_food_update" : "personal_correction";
      const input = effectiveMode === "correction"
        ? {
            foodId: targetId,
            calories: nullableNumber(calories),
            proteinG: nullableNumber(protein),
            carbsG: nullableNumber(carbs),
            fatG: nullableNumber(fat),
            basisAmount: nullableNumber(basisAmount),
            basisUnit: basisUnit === "g" || basisUnit === "ml" ? basisUnit : null,
          }
        : {
            id: effectiveMode === "edit" ? food?.id : undefined,
            name,
            servingLabel,
            calories: Number(calories),
            proteinG: nullableNumber(protein),
            carbsG: nullableNumber(carbs),
            fatG: nullableNumber(fat),
            basisAmount: nullableNumber(basisAmount),
            basisUnit,
            createSeparately,
          };
      const response = await fetch("/api/nutrition/v1/foods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, input }),
      });
      const result = await response.json().catch(() => ({})) as { duplicate?: Duplicate | null; error?: string };
      if (!response.ok) throw new Error(result.error || nt("customFoodSaveFailed"));
      if (effectiveMode === "create" && result.duplicate) {
        setDuplicate(result.duplicate);
        return;
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : nt("customFoodSaveFailed"));
    } finally {
      setPending(false);
    }
  }

  async function removeFood() {
    if (!food || food.source !== "my_food") return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/nutrition/v1/foods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "custom_food_delete", input: { foodId: food.id } }),
      });
      if (!response.ok) throw new Error(nt("customFoodSaveFailed"));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : nt("customFoodSaveFailed"));
    } finally {
      setPending(false);
    }
  }

  function chooseCorrection() {
    if (!duplicate || duplicate.source !== "catalog") return;
    setCorrectionTarget(duplicate);
    setDuplicate(null);
    setEffectiveMode("correction");
    setName(duplicate.food_name);
    setServingLabel(duplicate.serving_size);
    setCalories(""); setProtein(""); setCarbs(""); setFat("");
  }

  return (
    <div dir={dir} className="fixed inset-0 z-[60] flex justify-end bg-black/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="h-full w-full max-w-[480px] overflow-y-auto border-s border-border bg-background p-5 shadow-xl">
        <header className="grid grid-cols-[44px_1fr_44px] items-center gap-2 border-b border-border/70 pb-4">
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" onClick={onClose} aria-label={nt("close")}><X className="h-5 w-5" /></button>
          <div className="min-w-0 text-center"><h2 className="truncate text-lg font-semibold">{title}</h2>{effectiveMode === "correction" && targetName ? <p className="mt-1 truncate text-xs text-muted-foreground"><bdi dir="auto">{targetName}</bdi></p> : null}</div>
          {!duplicate ? <button form="custom-food-form" type="submit" disabled={!canSave} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40" aria-label={effectiveMode === "correction" ? nt("saveCorrection") : nt("saveFood")}><Check className="h-5 w-5" /></button> : <span aria-hidden="true" />}
        </header>

        {duplicate ? <div className="mt-5 rounded-xl border border-border p-4" role="status"><p className="font-semibold">{nt("possibleDuplicate")}</p><p className="mt-1 text-sm text-muted-foreground"><bdi dir="auto">{duplicate.food_name}</bdi> · <bdi dir="auto">{duplicate.serving_size}</bdi></p><div className="mt-4 grid gap-2"><button type="button" className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background" onClick={onClose}>{nt("useExisting")}</button>{duplicate.source === "catalog" ? <button type="button" className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium" onClick={chooseCorrection}>{nt("correctForMe")}</button> : null}<button type="button" className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium" onClick={() => void submit(true)}>{nt("createSeparately")}</button></div></div> : null}

        {!duplicate ? <form id="custom-food-form" className="mt-5 space-y-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          {effectiveMode !== "correction" ? <>
            <label className="block text-sm font-medium">{nt("foodName")}<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" required /></label>
            <label className="block text-sm font-medium">{nt("servingBasis")}<input value={servingLabel} onChange={(event) => setServingLabel(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" required /></label>
          </> : null}

          <fieldset className="space-y-3 border-t border-border/70 pt-5"><legend className="text-sm font-semibold">{nt("nutritionIsFor")}</legend><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{nt("basisAmount")}<input inputMode="decimal" value={basisAmount} onChange={(event) => setBasisAmount(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label><label className="text-sm font-medium">{nt("basisUnit")}<select value={basisUnit} onChange={(event) => setBasisUnit(event.target.value as typeof basisUnit)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal"><option value="g">g</option><option value="ml">ml</option>{effectiveMode !== "correction" ? <><option value="serving">serving</option><option value="piece">piece</option><option value="custom">custom</option></> : null}</select></label></div>
            <label className="block text-sm font-medium">{nt("calories")}<input inputMode="decimal" value={calories} onChange={(event) => setCalories(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" required={requiredCalories} /></label>
            <div className="grid grid-cols-3 gap-2"><label className="text-xs font-medium">{nt("macroProtein")}<input aria-label={nt("macroProtein")} inputMode="decimal" value={protein} onChange={(event) => setProtein(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2 text-sm font-normal" /></label><label className="text-xs font-medium">{nt("macroCarbs")}<input aria-label={nt("macroCarbs")} inputMode="decimal" value={carbs} onChange={(event) => setCarbs(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2 text-sm font-normal" /></label><label className="text-xs font-medium">{nt("macroFat")}<input aria-label={nt("macroFat")} inputMode="decimal" value={fat} onChange={(event) => setFat(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2 text-sm font-normal" /></label></div>
            <p className="text-xs text-muted-foreground">{nt("notAvailable")} values stay unknown; they are never saved as zero.</p>
          </fieldset>

          {pending ? <p className="text-sm text-muted-foreground" role="status">{nt("saving")}</p> : null}
          {error ? <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}

          {effectiveMode === "edit" && food?.source === "my_food" ? <div className="border-t border-border/70 pt-5">{confirmDelete ? <div className="rounded-xl border border-destructive/30 p-4"><p className="text-sm">{nt("deleteFoodConfirmation")}</p><div className="mt-3 flex gap-2"><button type="button" disabled={pending} onClick={() => void removeFood()} className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground">{nt("deleteFood")}</button><button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium">{nt("cancel")}</button></div></div> : <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 rounded-xl px-3 text-sm font-medium text-destructive hover:bg-destructive/10">{nt("deleteFood")}</button>}</div> : null}
        </form> : null}
      </section>
    </div>
  );
}
