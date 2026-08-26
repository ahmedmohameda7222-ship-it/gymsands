"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { useTodayDate } from "@/lib/hooks/use-today-date";
import type { ShoppingNeed, MealPlanWeekRow } from "@/services/nutrition-v1/server/meal-plan";
import { mealPlanApi } from "./meal-plan-api";

type ShoppingState = "Needed" | "Purchased" | "Don't need";
type ManualItem = { id: string; name: string; quantity: number; unit: string; state: ShoppingState; notes: string };
type DerivedEdit = { quantity: number | null; notes: string };
type ShoppingOverride = {
  states: Record<string, ShoppingState>;
  manualItems: ManualItem[];
  derivedEdits: Record<string, DerivedEdit>;
};
type ApiResponse = { week: MealPlanWeekRow | null; shoppingNeeds: ShoppingNeed[] };

function shift(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function monday(date: string) { const value = new Date(`${date}T12:00:00Z`); const day = value.getUTCDay(); value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1)); return value.toISOString().slice(0, 10); }
function keyFor(need: ShoppingNeed) { return `${need.foodId}|${need.unit}|${need.qualifier ?? ""}`; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function normalizeState(value: unknown): ShoppingState {
  return value === "Purchased" || value === "Don't need" ? value : "Needed";
}

function shoppingFromWeek(week: MealPlanWeekRow | null): ShoppingOverride {
  const shopping = object(object(week?.week_override_json).shopping);
  const rawStates = object(shopping.states);
  const states = Object.fromEntries(Object.entries(rawStates).map(([key, value]) => [key, normalizeState(value)]));
  const rawEdits = object(shopping.derivedEdits);
  const derivedEdits = Object.fromEntries(Object.entries(rawEdits).flatMap(([key, value]) => {
    const edit = object(value);
    const quantity = edit.quantity === null || edit.quantity === undefined ? null : Number(edit.quantity);
    return [[key, {
      quantity: quantity !== null && Number.isFinite(quantity) && quantity >= 0 ? quantity : null,
      notes: typeof edit.notes === "string" ? edit.notes : "",
    } satisfies DerivedEdit]];
  }));
  const manualItems = Array.isArray(shopping.manualItems) ? shopping.manualItems.flatMap((raw): ManualItem[] => {
    const item = object(raw);
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const id = typeof item.id === "string" ? item.id : "";
    const quantity = Number(item.quantity);
    if (!id || !name || !Number.isFinite(quantity) || quantity < 0) return [];
    return [{
      id,
      name,
      quantity,
      unit: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : "item",
      state: normalizeState(item.state),
      notes: typeof item.notes === "string" ? item.notes : "",
    }];
  }) : [];
  return { states, manualItems, derivedEdits };
}

export function ShoppingList() {
  const params = useSearchParams();
  const today = useTodayDate();
  const weekStart = params.get("week") ?? monday(today);
  const selectedDate = params.get("date") ?? weekStart;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: "", quantity: "1", unit: "item", notes: "" });
  const [editingDerived, setEditingDerived] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await mealPlanApi<ApiResponse>(`/api/nutrition/v1/meal-plan/week?weekStart=${encodeURIComponent(weekStart)}&date=${encodeURIComponent(selectedDate)}`));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Shopping List could not be loaded."); }
  }, [selectedDate, weekStart]);
  useEffect(() => { void load(); }, [load]);

  const shoppingOverride = useMemo(() => shoppingFromWeek(data?.week ?? null), [data]);

  async function saveShopping(next: ShoppingOverride) {
    if (busy) return;
    setBusy(true);
    try {
      const nextOverride = { ...(data?.week?.week_override_json ?? {}), shopping: next };
      await mealPlanApi("/api/nutrition/v1/meal-plan/week", {
        method: "POST",
        body: JSON.stringify({
          kind: "mutate",
          weekId: data?.week?.id ?? null,
          weekStartDate: weekStart,
          baseRevision: data?.week?.revision ?? 0,
          operationId: crypto.randomUUID(),
          mutation: { weekOverride: nextOverride },
        }),
      });
      await load();
      setNotice("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Shopping change could not be saved."); }
    finally { setBusy(false); }
  }

  function setDerivedState(need: ShoppingNeed, state: ShoppingState) {
    void saveShopping({ ...shoppingOverride, states: { ...shoppingOverride.states, [keyFor(need)]: state } });
  }

  function patchDerived(need: ShoppingNeed, patch: Partial<DerivedEdit>) {
    const key = keyFor(need);
    const current = shoppingOverride.derivedEdits[key] ?? { quantity: null, notes: "" };
    void saveShopping({ ...shoppingOverride, derivedEdits: { ...shoppingOverride.derivedEdits, [key]: { ...current, ...patch } } });
  }

  function addManual() {
    const name = draft.name.trim();
    const quantity = Number(draft.quantity);
    if (!name || !Number.isFinite(quantity) || quantity < 0) return;
    void saveShopping({
      ...shoppingOverride,
      manualItems: [...shoppingOverride.manualItems, {
        id: crypto.randomUUID(),
        name,
        quantity,
        unit: draft.unit.trim() || "item",
        state: "Needed",
        notes: draft.notes.trim(),
      }],
    });
    setDraft({ name: "", quantity: "1", unit: "item", notes: "" });
  }

  function patchManual(item: ManualItem, patch: Partial<ManualItem>) {
    void saveShopping({
      ...shoppingOverride,
      manualItems: shoppingOverride.manualItems.map((current) => current.id === item.id ? { ...current, ...patch } : current),
    });
  }

  function removeManual(id: string) {
    void saveShopping({ ...shoppingOverride, manualItems: shoppingOverride.manualItems.filter((item) => item.id !== id) });
  }

  async function carryUncheckedItems() {
    const carry = shoppingOverride.manualItems.filter((item) => item.state === "Needed");
    if (!carry.length) { setNotice("There are no unchecked manual items to carry forward."); return; }
    if (busy) return;
    setBusy(true);
    try {
      const nextWeekStart = shift(weekStart, 7);
      const nextData = await mealPlanApi<ApiResponse>(`/api/nutrition/v1/meal-plan/week?weekStart=${encodeURIComponent(nextWeekStart)}&date=${encodeURIComponent(nextWeekStart)}`);
      const nextShopping = shoppingFromWeek(nextData.week);
      const carried = carry.map((item) => ({ ...item, id: crypto.randomUUID(), state: "Needed" as const }));
      const nextOverride = {
        ...(nextData.week?.week_override_json ?? {}),
        shopping: { ...nextShopping, manualItems: [...nextShopping.manualItems, ...carried] },
      };
      await mealPlanApi("/api/nutrition/v1/meal-plan/week", {
        method: "POST",
        body: JSON.stringify({
          kind: "mutate",
          weekId: nextData.week?.id ?? null,
          weekStartDate: nextWeekStart,
          baseRevision: nextData.week?.revision ?? 0,
          operationId: crypto.randomUUID(),
          mutation: { weekOverride: nextOverride },
        }),
      });
      setNotice(`${carried.length} manual item${carried.length === 1 ? "" : "s"} carried to the next week.`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unchecked items could not be carried forward.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
      <header className="border-b border-border pb-5"><Link href={`/my-meal-plan?date=${encodeURIComponent(selectedDate)}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl text-sm font-medium"><ChevronLeft className="h-4 w-4" />Meal Plan</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">Shopping List</h1><p className="mt-1 text-sm text-muted-foreground">Derived from the frozen plan for {weekStart}–{shift(weekStart, 6)}. Manual items stay independent.</p></header>
      {notice ? <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}

      <section className="py-5" aria-labelledby="derived-shopping">
        <h2 id="derived-shopping" className="font-semibold">From this week</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only compatible source identity, unit, and qualifier are aggregated. Manual quantity edits and notes stay user-owned.</p>
        <div className="mt-3 divide-y divide-border">{data?.shoppingNeeds?.length ? data.shoppingNeeds.map((need) => {
          const key = keyFor(need);
          const state = shoppingOverride.states[key] ?? "Needed";
          const edit = shoppingOverride.derivedEdits[key];
          const quantity = edit?.quantity ?? need.quantity;
          return <div key={key} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{need.name}</p><p className="text-xs text-muted-foreground">{quantity} {need.unit}{need.qualifier ? ` · ${need.qualifier}` : ""} · Derived · {need.sourceOccurrenceIds.length} planned source{need.sourceOccurrenceIds.length === 1 ? "" : "s"}</p>{edit?.notes ? <p className="mt-1 text-xs text-muted-foreground">{edit.notes}</p> : null}</div><div className="flex flex-wrap items-center gap-2"><select value={state} disabled={busy} onChange={(event) => setDerivedState(need, event.target.value as ShoppingState)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" aria-label={`Shopping state for ${need.name}`}><option>Needed</option><option>Purchased</option><option>Don't need</option></select><button type="button" onClick={() => setEditingDerived(editingDerived === key ? null : key)} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">{editingDerived === key ? "Done" : "Edit"}</button></div></div>{editingDerived === key ? <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2"><label className="text-xs font-medium">Manual quantity<input type="number" min="0" step="any" defaultValue={quantity} aria-label={`manual quantity for ${need.name}`} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0) patchDerived(need, { quantity: value }); }} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label><label className="text-xs font-medium">Notes<input defaultValue={edit?.notes ?? ""} onBlur={(event) => patchDerived(need, { notes: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label></div> : null}</div>;
        }) : <p className="py-4 text-sm text-muted-foreground">No derived ingredients yet.</p>}</div>
      </section>

      <section className="border-t border-border py-5" aria-labelledby="manual-shopping">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="manual-shopping" className="font-semibold">Manual items</h2><p className="mt-1 text-sm text-muted-foreground">Independent from derived plan contributions.</p></div><button type="button" disabled={busy} onClick={() => void carryUncheckedItems()} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Carry unchecked items to next week</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Add an item" aria-label="Manual item name" className="min-h-11 min-w-0 rounded-xl border border-border bg-background px-3 text-sm" /><input type="number" min="0" step="any" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} aria-label="Manual item quantity" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} aria-label="Manual item unit" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" disabled={busy} onClick={addManual} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border px-3 text-sm font-medium"><Plus className="h-4 w-4" />Add</button></div>
        <input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional notes" aria-label="Manual item notes" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
        <div className="mt-3 divide-y divide-border">{shoppingOverride.manualItems.map((item) => <div key={item.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium">{item.name}</p><div className="flex items-center gap-2"><select value={item.state} disabled={busy} onChange={(event) => patchManual(item, { state: event.target.value as ShoppingState })} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" aria-label={`Shopping state for ${item.name}`}><option>Needed</option><option>Purchased</option><option>Don't need</option></select><button type="button" disabled={busy} onClick={() => removeManual(item.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-muted" aria-label={`Remove ${item.name}`}><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-2 grid gap-2 sm:grid-cols-[7rem_7rem_minmax(0,1fr)]"><input type="number" min="0" step="any" defaultValue={item.quantity} aria-label={`manual quantity for ${item.name}`} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0) patchManual(item, { quantity: value }); }} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input defaultValue={item.unit} aria-label={`Unit for ${item.name}`} onBlur={(event) => patchManual(item, { unit: event.target.value.trim() || "item" })} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" /><input defaultValue={item.notes} aria-label={`Notes for ${item.name}`} onBlur={(event) => patchManual(item, { notes: event.target.value })} placeholder="Notes" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" /></div></div>)}</div>
      </section>
    </main>
  );
}
