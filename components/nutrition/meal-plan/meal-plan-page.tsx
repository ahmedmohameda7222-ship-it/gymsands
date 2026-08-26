"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ShoppingCart } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { isIsoDate } from "@/lib/date-utils";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import type { EffectiveNutritionTarget } from "@/lib/nutrition-v1/targets";
import type { MealPlanOccurrenceMutation, MealPlanWeekProjection, PlannedOccurrenceRow, ShoppingNeed } from "@/services/nutrition-v1/server/meal-plan";
import { AddToPlanWorkspace } from "./add-to-plan-workspace";
import { mealPlanApi } from "./meal-plan-api";
import { MealSlotSection } from "./meal-slot-section";
import { PendingChangeReview } from "./pending-change-review";
import { PlannedNutritionSummary } from "./planned-nutrition-summary";
import { WeekStrip } from "./week-strip";

type PendingRequest = { id: string; base_revision: number; proposal_json: Record<string, unknown>; state: string };
type WeekResponse = MealPlanWeekProjection & { target: EffectiveNutritionTarget; pendingChangeRequests: PendingRequest[]; shoppingNeeds: ShoppingNeed[] };
const coreSlots = ["Breakfast", "Lunch", "Dinner", "Snacks"];

function shift(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function monday(date: string) { const value = new Date(`${date}T12:00:00Z`); const day = value.getUTCDay(); value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1)); return value.toISOString().slice(0, 10); }
function weekDates(weekStart: string) { return Array.from({ length: 7 }, (_, index) => shift(weekStart, index)); }
function label(date: string, options: Intl.DateTimeFormatOptions) { return new Intl.DateTimeFormat(undefined, options).format(new Date(`${date}T12:00:00`)); }

export function MealPlanPage() {
  const router = useRouter();
  const params = useSearchParams();
  const today = useTodayDate();
  const requestedDate = params.get("date");
  const selectedDate = requestedDate && isIsoDate(requestedDate) ? requestedDate : today;
  const weekStart = monday(selectedDate);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const [data, setData] = useState<WeekResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [addSlot, setAddSlot] = useState<string | null>(null);
  const [staleProposal, setStaleProposal] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await mealPlanApi<WeekResponse>(`/api/nutrition/v1/meal-plan/week?weekStart=${encodeURIComponent(weekStart)}&date=${encodeURIComponent(selectedDate)}`);
      setData(result); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Meal Plan could not be loaded."); }
    finally { setLoading(false); }
  }, [selectedDate, weekStart]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (requestedDate !== selectedDate) router.replace(`/my-meal-plan?date=${encodeURIComponent(selectedDate)}`, { scroll: false }); }, [requestedDate, router, selectedDate]);

  const selectedOccurrences = useMemo(() => (data?.occurrences ?? []).filter((item) => item.plan_date === selectedDate), [data, selectedDate]);
  const slots = useMemo(() => {
    const custom = selectedOccurrences.map((item) => item.meal_slot_key).filter((slot) => !coreSlots.includes(slot));
    return [...coreSlots, ...Array.from(new Set(custom))];
  }, [selectedOccurrences]);
  const target = data?.target?.available ? data.target.values : null;
  const allowExecution = selectedDate <= today;

  function selectDate(date: string) { router.push(`/my-meal-plan?date=${encodeURIComponent(date)}`, { scroll: false }); }
  function shiftWeek(days: number) { selectDate(shift(selectedDate, days)); }

  async function mutate(items: MealPlanOccurrenceMutation[]) {
    const result = await mealPlanApi<{ weekId: string; revision: number }>("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "mutate", weekId: data?.week?.id ?? null, weekStartDate: weekStart, baseRevision: data?.week?.revision ?? 0, operationId: crypto.randomUUID(), mutation: { upsertOccurrences: items } }) });
    if (!result.weekId) throw new Error("Meal Plan mutation was not confirmed.");
    await load();
  }
  async function markEaten(id: string) {
    try { await mealPlanApi("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "complete", occurrenceId: id, operationId: crypto.randomUUID(), executionSnapshot: null }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Planned meal could not be completed."); }
  }
  function logWithChanges(id: string) { router.push(`/calories?date=${encodeURIComponent(selectedDate)}&plannedOccurrence=${encodeURIComponent(id)}`); }
  async function approve(id: string) {
    try {
      const result = await mealPlanApi<{ state: "applied" | "stale" }>("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "apply_change_request", changeRequestId: id }) });
      setStaleProposal(result.state === "stale"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Proposed changes could not be applied."); }
  }
  async function cancel(id: string) {
    try { await mealPlanApi("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "cancel_change_request", changeRequestId: id }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Proposed changes could not be cancelled."); }
  }
  async function planWithChatGPT() {
    const prompt = `Help me propose changes for my Plaivra Meal Plan week starting ${weekStart}. Treat the plan as intention only. Return structured ADD, CHANGE, and REMOVE proposals for explicit review; do not log anything as eaten.`;
    try { await navigator.clipboard.writeText(prompt); setNotice("ChatGPT planning prompt copied. Review any returned proposal before Plaivra applies it."); }
    catch { setNotice("Open ChatGPT externally and ask for structured Meal Plan changes. Review every proposal before applying it in Plaivra."); }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Meal Plan</h1><p className="mt-1 text-sm text-muted-foreground">Weekly nutrition intention. Diary remains actual truth.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void planWithChatGPT()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium">Plan with ChatGPT <ExternalLink className="h-4 w-4" /></button><Link href={`/my-meal-plan/shopping?week=${encodeURIComponent(weekStart)}&date=${encodeURIComponent(selectedDate)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-3 text-sm font-semibold text-background"><ShoppingCart className="h-4 w-4" />Shopping</Link></div></div>
        <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => shiftWeek(-7)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button><div className="text-center"><p className="text-sm font-semibold">{label(weekStart, { month: "short", day: "numeric" })} – {label(shift(weekStart, 6), { month: "short", day: "numeric", year: "numeric" })}</p><p className="text-xs text-muted-foreground">Week revision {data?.week?.revision ?? 0}</p></div><button type="button" onClick={() => shiftWeek(7)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button></div>
        <div className="mt-4"><WeekStrip dates={dates} selectedDate={selectedDate} today={today} onSelect={selectDate} /></div>
      </header>
      {notice ? <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {loading && !data ? <div className="mt-5 space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-muted" /><div className="h-36 animate-pulse rounded-2xl bg-muted" /></div> : null}
      {data ? <>
        <div className="py-5"><div className="flex items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected day</p><h2 className="mt-1 text-xl font-semibold">{label(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h2></div>{selectedDate !== today ? <button type="button" onClick={() => selectDate(today)} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">Today</button> : null}</div></div>
        <PlannedNutritionSummary occurrences={selectedOccurrences} target={target} />
        <PendingChangeReview requests={data.pendingChangeRequests} stale={staleProposal} onApprove={(id) => void approve(id)} onCancel={(id) => void cancel(id)} />
        <div aria-label="Selected day meals">{slots.map((slot) => <MealSlotSection key={slot} label={slot} items={selectedOccurrences.filter((item) => item.meal_slot_key === slot)} allowExecution={allowExecution} onAdd={() => setAddSlot(slot)} onMarkEaten={(id) => void markEaten(id)} onLogWithChanges={logWithChanges} />)}</div>
        {!selectedOccurrences.length ? <div className="py-6 text-center"><p className="font-medium">Nothing planned for this day.</p><p className="mt-1 text-sm text-muted-foreground">Add manually or use ChatGPT as an external planning accelerator.</p><button type="button" onClick={() => setAddSlot("Breakfast")} className="mt-3 min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Add to plan</button></div> : null}
      </> : null}
      {addSlot ? <AddToPlanWorkspace date={selectedDate} mealSlotKey={addSlot} onClose={() => setAddSlot(null)} onCommit={mutate} /> : null}
    </main>
  );
}
