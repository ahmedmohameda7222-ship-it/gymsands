"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Loader2, Plus, Trash2, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineFeedback } from "@/components/motion";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EAT_MEAL_GROUPS, groupFoodLogs, type EatMealGroup } from "@/lib/eat/eat-model";
import { eatEnergyDisplayValue, eatEnergyInputToKcal, formatEatEnergy } from "@/lib/eat/eat-units";
import { useEatTranslation } from "@/lib/i18n/eat";
import { deleteEatFoodLog, getEatFoodLogs, getEatMealPlanItems, isEatLinkedEditConsistencyError, updateEatFoodLog, type EatFoodLogPatch } from "@/services/database/eat";
import type { UserAppSettings } from "@/services/database/user-settings";
import type { FoodLog, MealPlanItem, MealType } from "@/types";

type FoodLogEditForm = Omit<EatFoodLogPatch, "calories"> & { energy: number };

function numberInput(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "0";
}

function editState(log: FoodLog, energyUnit: UserAppSettings["energyUnit"]): FoodLogEditForm {
  return {
    foodName: log.food_name,
    quantity: Number(log.quantity) || 1,
    servingSize: log.serving_size,
    mealType: (["Breakfast", "Lunch", "Dinner", "Snack"] as string[]).includes(log.meal_type) ? log.meal_type as MealType : "Lunch",
    energy: eatEnergyDisplayValue(Number(log.calories) || 0, energyUnit),
    proteinG: Number(log.protein_g) || 0,
    carbsG: Number(log.carbs_g) || 0,
    fatG: Number(log.fat_g) || 0,
    notes: log.notes
  };
}

export function EatFoodLog({
  userId,
  logs,
  mealPlanItems,
  loading,
  error,
  energyUnit,
  onRetry,
  onReloadPlannedMeals,
  onAdd,
  onChanged
}: {
  userId: string;
  logs: FoodLog[];
  mealPlanItems: MealPlanItem[];
  loading: boolean;
  error?: string;
  energyUnit: UserAppSettings["energyUnit"];
  onRetry: () => void;
  onReloadPlannedMeals: () => void;
  onAdd: (mealType: MealType) => void;
  onChanged: (logs: FoodLog[]) => void;
}) {
  const { et, mealLabel, locale } = useEatTranslation();
  const grouped = useMemo(() => groupFoodLogs(logs), [logs]);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [form, setForm] = useState<FoodLogEditForm | null>(null);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  const { dialog: confirmDialog, ask } = useConfirm();

  useEffect(() => {
    if (editing) setForm(editState(editing, energyUnit));
  }, [editing, energyUnit]);

  const linkedLogIds = useMemo(() => new Set(mealPlanItems.map((item) => item.food_log_id).filter(Boolean)), [mealPlanItems]);

  function open(log: FoodLog) {
    setFeedback(null);
    setEditing(log);
    setForm(editState(log, energyUnit));
  }

  function close() {
    if (!pending) {
      setEditing(null);
      setForm(null);
      setFeedback(null);
    }
  }

  async function save() {
    if (!editing || !form || pending) return;
    setPending("save");
    setFeedback({ type: "info", message: `${et("saveChanges")}…` });
    const patch: EatFoodLogPatch = {
      ...form,
      calories: eatEnergyInputToKcal(form.energy, energyUnit)
    };
    try {
      const result = await updateEatFoodLog(userId, editing.id, patch);
      const nextLogs = logs.map((log) => log.id === result.log.id ? result.log : log);
      onChanged(nextLogs);
      setEditing(result.log);
      setForm(editState(result.log, energyUnit));
      setFeedback({ type: "info", message: et("successSaved") });
    } catch (saveError) {
      if (isEatLinkedEditConsistencyError(saveError)) {
        try {
          const [freshLogs] = await Promise.all([
            getEatFoodLogs(userId, editing.log_date),
            getEatMealPlanItems(userId, editing.log_date)
          ]);
          onChanged(freshLogs);
          onReloadPlannedMeals();
          const freshLog = freshLogs.find((log) => log.id === editing.id) ?? null;
          if (freshLog) {
            setEditing(freshLog);
            setForm(editState(freshLog, energyUnit));
          }
        } finally {
          setFeedback({ type: "error", message: et("criticalConsistencyError") });
        }
      } else {
        setFeedback({ type: "error", message: et("saveFailed") });
      }
    } finally {
      setPending(null);
    }
  }

  function requestDelete() {
    if (!editing || pending) return;
    const linked = linkedLogIds.has(editing.id);
    ask({
      title: et("deleteConfirm"),
      description: linked ? et("deleteLinkedProtected") : `${editing.food_name} · ${editing.log_date}`,
      confirmLabel: et("delete"),
      cancelLabel: et("close"),
      variant: "destructive",
      onConfirm: () => void remove(linked)
    });
  }

  async function remove(linked: boolean) {
    if (!editing || pending) return;
    if (linked) {
      setFeedback({ type: "error", message: et("deleteLinkedProtected") });
      return;
    }
    setPending("delete");
    try {
      await deleteEatFoodLog(userId, editing.id);
      onChanged(logs.filter((log) => log.id !== editing.id));
      setEditing(null);
      setForm(null);
    } catch {
      setFeedback({ type: "error", message: et("saveFailed") });
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {confirmDialog}
      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2"><Utensils className="h-5 w-5 text-primary" />{et("foodLog")}</CardTitle>
          <Button type="button" className="min-h-12" onClick={() => onAdd("Lunch")}><Plus className="h-4 w-4" />{et("addFood")}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="py-8 text-center text-sm text-muted-foreground">{et("loadingLogs")}</p> : null}
          {error ? <div className="flex flex-col gap-3 rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-destructive">{et("logsFailed")}</p><Button type="button" variant="outline" onClick={onRetry}>{et("retry")}</Button></div> : null}
          {!loading && !error ? EAT_MEAL_GROUPS.map((group) => (
            <MealGroup
              key={group}
              group={group}
              logs={grouped[group]}
              label={mealLabel(group)}
              energyUnit={energyUnit}
              locale={locale}
              onAdd={() => onAdd(group === "Other" ? "Lunch" : group)}
              onOpen={open}
            />
          )) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(next) => { if (!next) close(); }}>
        <DialogContent layout="responsive-drawer" variant="glass" closeLabel={et("close")}>
          <div className="shrink-0 border-b border-border/70 px-5 py-4">
            <DialogHeader className="mb-0">
              <DialogTitle>{et("editFood")}</DialogTitle>
              <DialogDescription>{editing ? `${editing.log_date} · ${mealLabel(editing.meal_type)}` : ""}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            {form ? <div className="space-y-4">
              <Field label={et("foodLog")}><Input value={form.foodName} onChange={(event) => setForm({ ...form, foodName: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={et("quantity")}><Input type="number" min="0.1" step="0.1" inputMode="decimal" value={numberInput(form.quantity)} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></Field>
                <Field label={et("meal")}><select value={form.mealType} onChange={(event) => setForm({ ...form, mealType: event.target.value as MealType })} className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm">{(["Breakfast", "Lunch", "Dinner", "Snack"] as MealType[]).map((type) => <option key={type} value={type}>{mealLabel(type)}</option>)}</select></Field>
              </div>
              <Field label={et("serving")}><Input value={form.servingSize} onChange={(event) => setForm({ ...form, servingSize: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label={`${et("calories")} (${energyUnit})`} value={form.energy} onChange={(energy) => setForm({ ...form, energy })} />
                <NumberField label={`${et("protein")} (g)`} value={form.proteinG} onChange={(proteinG) => setForm({ ...form, proteinG })} />
                <NumberField label={`${et("carbs")} (g)`} value={form.carbsG} onChange={(carbsG) => setForm({ ...form, carbsG })} />
                <NumberField label={`${et("fat")} (g)`} value={form.fatG} onChange={(fatG) => setForm({ ...form, fatG })} />
              </div>
              <Field label={et("notes")}><Input value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
              <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Button type="button" className="min-h-12" onClick={save} disabled={Boolean(pending)}>{pending === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}{pending === "save" ? `${et("saveChanges")}…` : et("saveChanges")}</Button>
                <Button type="button" variant="destructive" className="min-h-12" onClick={requestDelete} disabled={Boolean(pending)}>{pending === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{et("delete")}</Button>
              </div>
            </div> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MealGroup({ group, logs, label, energyUnit, locale, onAdd, onOpen }: { group: EatMealGroup; logs: FoodLog[]; label: string; energyUnit: UserAppSettings["energyUnit"]; locale: string; onAdd: () => void; onOpen: (log: FoodLog) => void }) {
  const { et } = useEatTranslation();
  const calories = logs.reduce((sum, log) => sum + Number(log.calories || 0), 0);
  return (
    <section aria-labelledby={`eat-group-${group}`} className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 id={`eat-group-${group}`} className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">{logs.length ? formatEatEnergy(calories, energyUnit, locale) : ""}</span>
        <div className="flex-1 border-t border-border/70" />
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onAdd}><Plus className="h-4 w-4" />{et("add")}</Button>
      </div>
      {logs.length ? logs.map((log) => (
        <button key={log.id} type="button" onClick={() => onOpen(log)} className="flex min-h-16 w-full items-center justify-between gap-3 rounded-[14px] border border-border/70 bg-card p-3 text-start transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{log.food_name}</p><p className="mt-1 text-xs text-muted-foreground">{log.quantity} × {log.serving_size}</p><p className="mt-1 text-xs text-muted-foreground">{formatEatEnergy(log.calories, energyUnit, locale)} · P {Math.round(log.protein_g * 10) / 10} g · C {Math.round(log.carbs_g * 10) / 10} g · F {Math.round(log.fat_g * 10) / 10} g</p></div>
          <Edit3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )) : <div className="rounded-[14px] border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">—</div>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><Input type="number" min="0" step="0.1" inputMode="decimal" value={numberInput(value)} onChange={(event) => onChange(Number(event.target.value))} /></Field>;
}
