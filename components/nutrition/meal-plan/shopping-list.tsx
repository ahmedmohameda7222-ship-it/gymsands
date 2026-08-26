"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { useTodayDate } from "@/lib/hooks/use-today-date";
import type { ShoppingNeed, MealPlanWeekRow } from "@/services/nutrition-v1/server/meal-plan";
import { mealPlanApi } from "./meal-plan-api";

type ShoppingState = "Needed" | "Purchased" | "Don't need";
type ManualItem = { id: string; name: string; quantity: number; unit: string; state: ShoppingState };
type ApiResponse = { week: MealPlanWeekRow | null; shoppingNeeds: ShoppingNeed[] };

function shift(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function monday(date: string) { const value = new Date(`${date}T12:00:00Z`); const day = value.getUTCDay(); value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1)); return value.toISOString().slice(0, 10); }
function keyFor(need: ShoppingNeed) { return `${need.foodId}|${need.unit}|${need.qualifier ?? ""}`; }

export function ShoppingList() {
  const params = useSearchParams();
  const today = useTodayDate();
  const weekStart = params.get("week") ?? monday(today);
  const selectedDate = params.get("date") ?? weekStart;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await mealPlanApi<ApiResponse>(`/api/nutrition/v1/meal-plan/week?weekStart=${encodeURIComponent(weekStart)}&date=${encodeURIComponent(selectedDate)}`));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Shopping List could not be loaded."); }
  }, [selectedDate, weekStart]);
  useEffect(() => { void load(); }, [load]);

  const shoppingOverride = useMemo(() => {
    const root = data?.week?.week_override_json;
    const shopping = root && typeof root.shopping === "object" && root.shopping && !Array.isArray(root.shopping) ? root.shopping as Record<string, unknown> : {};
    const states = shopping.states && typeof shopping.states === "object" && !Array.isArray(shopping.states) ? shopping.states as Record<string, ShoppingState> : {};
    const manualItems = Array.isArray(shopping.manualItems) ? shopping.manualItems.filter((item): item is ManualItem => Boolean(item && typeof item === "object" && "id" in item && "name" in item)) : [];
    return { states, manualItems };
  }, [data]);

  async function saveShopping(next: { states: Record<string, ShoppingState>; manualItems: ManualItem[] }) {
    if (busy) return;
    setBusy(true);
    try {
      const nextOverride = { ...(data?.week?.week_override_json ?? {}), shopping: next };
      await mealPlanApi("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "mutate", weekId: data?.week?.id ?? null, weekStartDate: weekStart, baseRevision: data?.week?.revision ?? 0, operationId: crypto.randomUUID(), mutation: { weekOverride: nextOverride } }) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Shopping change could not be saved."); } finally { setBusy(false); }
  }

  function setDerivedState(need: ShoppingNeed, state: ShoppingState) {
    void saveShopping({ states: { ...shoppingOverride.states, [keyFor(need)]: state }, manualItems: shoppingOverride.manualItems });
  }
  function addManual() {
    const name = draft.trim(); if (!name) return;
    void saveShopping({ states: shoppingOverride.states, manualItems: [...shoppingOverride.manualItems, { id: crypto.randomUUID(), name, quantity: 1, unit: "item", state: "Needed" }] });
    setDraft("");
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
      <header className="border-b border-border pb-5"><Link href={`/my-meal-plan?date=${encodeURIComponent(selectedDate)}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl text-sm font-medium"><ChevronLeft className="h-4 w-4" />Meal Plan</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">Shopping List</h1><p className="mt-1 text-sm text-muted-foreground">Derived from the frozen plan for {weekStart}–{shift(weekStart, 6)}. Manual items stay independent.</p></header>
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
      <section className="py-5" aria-labelledby="derived-shopping"><h2 id="derived-shopping" className="font-semibold">From this week</h2><p className="mt-1 text-sm text-muted-foreground">Only compatible source identity, unit, and qualifier are aggregated.</p>
        <div className="mt-3 divide-y divide-border">{data?.shoppingNeeds?.length ? data.shoppingNeeds.map((need) => { const state = shoppingOverride.states[keyFor(need)] ?? "Needed"; return <div key={keyFor(need)} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{need.name}</p><p className="text-xs text-muted-foreground">{need.quantity} {need.unit}{need.qualifier ? ` · ${need.qualifier}` : ""} · {need.sourceOccurrenceIds.length} planned source{need.sourceOccurrenceIds.length === 1 ? "" : "s"}</p></div><select value={state} disabled={busy} onChange={(event) => setDerivedState(need, event.target.value as ShoppingState)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" aria-label={`Shopping state for ${need.name}`}><option>Needed</option><option>Purchased</option><option>Don't need</option></select></div>; }) : <p className="py-4 text-sm text-muted-foreground">No derived ingredients yet.</p>}</div>
      </section>
      <section className="border-t border-border py-5" aria-labelledby="manual-shopping"><h2 id="manual-shopping" className="font-semibold">Manual items</h2><div className="mt-3 flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add an item" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" disabled={busy} onClick={addManual} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-3 text-sm font-medium"><Plus className="h-4 w-4" />Add</button></div><div className="mt-3 divide-y divide-border">{shoppingOverride.manualItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><p className="text-sm font-medium">{item.name}</p><span className="text-xs text-muted-foreground">{item.state}</span></div>)}</div></section>
    </main>
  );
}
