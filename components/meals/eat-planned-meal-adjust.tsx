"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineFeedback } from "@/components/motion";
import { eatEnergyDisplayValue, eatEnergyInputToKcal } from "@/lib/eat/eat-units";
import { useEatTranslation } from "@/lib/i18n/eat";
import type { UserAppSettings } from "@/services/database/user-settings";
import type { EatFoodLogPatch } from "@/services/database/eat";
import type { MealPlanItem, MealType } from "@/types";

type AdjustForm = Omit<EatFoodLogPatch, "calories"> & { energy: number | null };

function draft(item: MealPlanItem, energyUnit: UserAppSettings["energyUnit"]): AdjustForm {
  return {
    foodName: item.food_name,
    quantity: item.quantity,
    servingSize: item.serving_size,
    mealType: item.meal_type,
    energy: item.calories === null ? null : eatEnergyDisplayValue(item.calories, energyUnit),
    proteinG: item.protein_g,
    carbsG: item.carbs_g,
    fatG: item.fat_g,
    notes: item.notes
  };
}

export function EatPlannedMealAdjust({
  item,
  open,
  pending,
  error,
  energyUnit,
  onOpenChange,
  onConfirm
}: {
  item: MealPlanItem | null;
  open: boolean;
  pending: boolean;
  error?: string;
  energyUnit: UserAppSettings["energyUnit"];
  onOpenChange: (open: boolean) => void;
  onConfirm: (patch: EatFoodLogPatch, updatePlan: boolean) => void;
}) {
  const { et, mealLabel } = useEatTranslation();
  const [form, setForm] = useState<AdjustForm | null>(item ? draft(item, energyUnit) : null);
  const [updatePlan, setUpdatePlan] = useState(false);
  useEffect(() => { if (item) { setForm(draft(item, energyUnit)); setUpdatePlan(false); } }, [energyUnit, item]);
  function confirm() {
    if (!form) return;
    onConfirm({ ...form, calories: form.energy === null ? null : eatEnergyInputToKcal(form.energy, energyUnit) }, updatePlan);
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}><DialogContent layout="responsive-drawer" variant="glass" closeLabel={et("close")}>
    <div className="shrink-0 border-b border-border/70 px-5 py-4"><DialogHeader className="mb-0"><DialogTitle>{et("adjustFirst")}</DialogTitle><DialogDescription>{item ? `${item.food_name} · ${mealLabel(item.meal_type)} · ${item.plan_date}` : ""}</DialogDescription></DialogHeader></div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">{form ? <div className="space-y-4">
      <Field label={et("foodLog")}><Input value={form.foodName} onChange={(event) => setForm({ ...form, foodName: event.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><NumberField label={et("quantity")} value={form.quantity} min={0.1} onChange={(quantity) => setForm({ ...form, quantity })} /><Field label={et("meal")}><select value={form.mealType} onChange={(event) => setForm({ ...form, mealType: event.target.value as MealType })} className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm">{(["Breakfast", "Lunch", "Dinner", "Snack"] as MealType[]).map((type) => <option key={type} value={type}>{mealLabel(type)}</option>)}</select></Field></div>
      <Field label={et("serving")}><Input value={form.servingSize} onChange={(event) => setForm({ ...form, servingSize: event.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><NullableNumberField label={`${et("calories")} (${energyUnit})`} value={form.energy} onChange={(energy) => setForm({ ...form, energy })} /><NullableNumberField label={`${et("protein")} (g)`} value={form.proteinG} onChange={(proteinG) => setForm({ ...form, proteinG })} /><NullableNumberField label={`${et("carbs")} (g)`} value={form.carbsG} onChange={(carbsG) => setForm({ ...form, carbsG })} /><NullableNumberField label={`${et("fat")} (g)`} value={form.fatG} onChange={(fatG) => setForm({ ...form, fatG })} /></div>
      <Field label={et("notes")}><Input value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
      <label className="flex min-h-12 items-center gap-3 rounded-[14px] border border-border/70 p-3 text-sm"><input type="checkbox" checked={updatePlan} onChange={(event) => setUpdatePlan(event.target.checked)} /><span>{et("saveChanges")} · {et("plannedNextMeal")}</span></label>
      <InlineFeedback message={error} variant="error" />
      <Button type="button" className="min-h-12 w-full" onClick={confirm} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{pending ? et("logging") : et("markEaten")}</Button>
    </div> : null}</div>
  </DialogContent></Dialog>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) { return <Field label={label}><Input type="number" min={min} step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></Field>; }
function NullableNumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) { return <Field label={label}><Input type="number" min={0} step="0.1" value={value === null ? "" : value} onChange={(event) => { const raw = event.target.value.trim(); onChange(raw ? Number(raw) : null); }} /></Field>; }