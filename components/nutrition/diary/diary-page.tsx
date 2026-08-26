"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { LoggingSession } from "@/components/nutrition/diary/logging-session";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { isIsoDate } from "@/lib/date-utils";
import type { DiaryActualLog, DiaryProjection } from "@/services/nutrition-v1/server/diary";

const standardMeals = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function headers(token?: string | null, json = false) {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

function nutritionValue(value: number | null, unit: string) {
  return value === null ? "Not available" : `${Math.round(value * 10) / 10}${unit}`;
}

function mealLogs(logs: DiaryActualLog[], meal: string) {
  return logs.filter((log) => log.mealType.toLowerCase() === meal.toLowerCase() || (meal === "Snack" && log.mealType.toLowerCase() === "snacks"));
}

export function DiaryPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = useTodayDate();
  const rawDate = searchParams.get("date");
  const date = rawDate && isIsoDate(rawDate) ? rawDate : today;
  const [projection, setProjection] = useState<DiaryProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [waterPending, setWaterPending] = useState(false);
  const [planPending, setPlanPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/nutrition/v1/diary?date=${encodeURIComponent(date)}`, { headers: headers(token) });
      if (!response.ok) throw new Error("Diary could not be loaded.");
      setProjection(await response.json() as DiaryProjection);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diary could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [date, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (rawDate !== date) router.replace(`/calories?date=${encodeURIComponent(date)}`, { scroll: false }); }, [date, rawDate, router]);

  const actualDomain = projection?.domains.actual;
  const logs = useMemo(() => actualDomain?.status === "ready" ? actualDomain.data.logs : [], [actualDomain]);
  const remaining = projection?.position.remaining ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const actual = projection?.position.actual ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const target = projection?.position.target ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const planned = projection?.domains.planned.status === "ready" ? projection.domains.planned.data : [];
  const hydration = projection?.domains.hydration.status === "ready" ? projection.domains.hydration.data : null;
  const savedMeals = projection?.domains.savedMeals.status === "ready" ? projection.domains.savedMeals.data : [];
  const targetWater = projection?.domains.target.status === "ready" && projection.domains.target.data.available ? projection.domains.target.data.values?.water_ml ?? null : null;
  const otherMealLogs = logs.filter((log) => log.mealType.toLowerCase() === "other");

  function selectDate(next: string) {
    router.push(`/calories?date=${encodeURIComponent(next)}`, { scroll: false });
  }

  async function addWater(amountMl: number) {
    if (waterPending) return;
    setWaterPending(true);
    try {
      const response = await fetch("/api/nutrition/v1/diary", { method: "POST", headers: headers(token, true), body: JSON.stringify({ kind: "water", date, amountMl }) });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError("Water could not be logged.");
    } finally {
      setWaterPending(false);
    }
  }

  async function markEaten(occurrenceId: string) {
    if (planPending) return;
    setPlanPending(occurrenceId);
    try {
      const response = await fetch("/api/nutrition/v1/log", { method: "POST", headers: headers(token, true), body: JSON.stringify({ kind: "complete_planned", occurrenceId, operationId: crypto.randomUUID() }) });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError("Planned item could not be completed.");
    } finally {
      setPlanPending(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <header className="border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Diary</h1><p className="mt-1 text-sm text-muted-foreground">Actual intake for the selected day.</p></div><button type="button" onClick={() => setLoggingMeal("Snack")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background"><Plus className="h-4 w-4" />Add Food</button></div>
        <div className="mt-4 flex items-center gap-2"><button type="button" onClick={() => selectDate(shiftDate(date, -1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button><input type="date" value={date} onChange={(event) => event.target.value && selectDate(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" onClick={() => selectDate(shiftDate(date, 1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border" aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>{date !== today ? <button type="button" onClick={() => selectDate(today)} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">Today</button> : null}</div>
      </header>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {loading && !projection ? <div className="mt-5 space-y-3"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-24 animate-pulse rounded-2xl bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div> : null}

      {projection ? <>
        <section className="mt-5 border-b border-border pb-5" aria-labelledby="actual-heading">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actual</p><h2 id="actual-heading" className="mt-1 text-2xl font-semibold">{nutritionValue(actual.caloriesKcal, " kcal")}</h2><p className="text-sm text-muted-foreground">of {nutritionValue(target.caloriesKcal, " kcal")} target</p></div><div className="text-end"><p className="text-xs text-muted-foreground">remaining</p><p className="text-lg font-semibold">{nutritionValue(remaining.caloriesKcal, " kcal")}</p></div></div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><p className="text-muted-foreground">Protein</p><p className="font-medium">{nutritionValue(actual.proteinG, "g")} / {nutritionValue(target.proteinG, "g")}</p></div><div><p className="text-muted-foreground">Carbs</p><p className="font-medium">{nutritionValue(actual.carbsG, "g")} / {nutritionValue(target.carbsG, "g")}</p></div><div><p className="text-muted-foreground">Fat</p><p className="font-medium">{nutritionValue(actual.fatG, "g")} / {nutritionValue(target.fatG, "g")}</p></div></div>
          {actualDomain?.status === "unavailable" ? <p className="mt-3 text-sm text-destructive">Actual intake is temporarily unavailable.</p> : null}
        </section>

        <section className="border-b border-border py-5" aria-labelledby="water-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="water-heading" className="font-semibold">Water</h2><p className="text-sm text-muted-foreground">{hydration ? `${hydration.totalMl} ml` : "Not available"}{targetWater === null ? "" : ` / ${targetWater} ml`}</p></div><div className="flex gap-2"><button type="button" disabled={waterPending} onClick={() => void addWater(250)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">+250 ml</button><button type="button" disabled={waterPending} onClick={() => void addWater(500)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">+500 ml</button></div></div></section>

        {planned.length ? <section className="border-b border-border py-5" aria-labelledby="planned-heading"><h2 id="planned-heading" className="font-semibold">Planned</h2><p className="mt-1 text-sm text-muted-foreground">Intent stays separate until you explicitly mark it eaten.</p><div className="mt-3 divide-y divide-border">{planned.map((item) => <div key={item.id} className="flex min-h-14 items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.mealType} · {item.status.replace("_", " ")}</p></div>{item.status === "planned" ? <button type="button" disabled={planPending === item.id} onClick={() => void markEaten(item.id)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Mark eaten</button> : null}</div>)}</div></section> : null}

        <section className="py-2" aria-label="Meals">{standardMeals.map((meal) => { const rows = mealLogs(logs, meal); const label = meal === "Snack" ? "Snacks" : meal; return <div key={meal} className="border-b border-border py-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{label}</h2><button type="button" onClick={() => setLoggingMeal(meal)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Add Food</button></div>{rows.length ? <div className="mt-2 divide-y divide-border">{rows.map((log) => <div key={log.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{log.foodName}</p><p className="text-xs text-muted-foreground">{log.quantity} × {log.servingLabel}</p></div><p className="shrink-0 text-sm font-medium">{nutritionValue(log.nutrition.caloriesKcal, " kcal")}</p></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Nothing logged.</p>}</div>; })}
          {otherMealLogs.length ? <div className="border-b border-border py-4"><h2 className="font-semibold">Other</h2><p className="mt-1 text-xs text-muted-foreground">Historical compatibility meal</p><div className="mt-2 divide-y divide-border">{otherMealLogs.map((log) => <div key={log.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{log.foodName}</p><p className="text-xs text-muted-foreground">{log.quantity} × {log.servingLabel}</p></div><p className="text-sm font-medium">{nutritionValue(log.nutrition.caloriesKcal, " kcal")}</p></div>)}</div></div> : null}
        </section>
      </> : null}

      {loggingMeal ? <LoggingSession date={date} meal={loggingMeal} savedMeals={savedMeals} onClose={() => setLoggingMeal(null)} onConfirmed={() => { setLoggingMeal(null); void load(); }} /> : null}
    </main>
  );
}
