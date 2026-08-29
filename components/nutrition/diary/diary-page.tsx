"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { LoggingSession } from "@/components/nutrition/diary/logging-session";
import { isIsoDate } from "@/lib/date-utils";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useEatTranslation } from "@/lib/i18n/eat";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import { resolveWaterLogIntent, type WaterLogIntent } from "@/lib/nutrition-v1/water-log-retry";
import type { DiaryActualLog, DiaryProjection } from "@/services/nutrition-v1/server/diary";

const standardMeals = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
const diaryCopy = {
  en: {
    description: "Actual intake for the selected day.", actual: "Actual", ofTarget: "of {target} target",
    actualUnavailable: "Actual intake is temporarily unavailable.", planned: "Planned",
    plannedDescription: "Intent stays separate until you explicitly mark it eaten.", nothingLogged: "Nothing logged.",
    historicalOther: "Historical compatibility meal", loadFailed: "Diary could not be loaded.",
    plannedMissing: "The planned item is no longer available for Log with changes.", waterFailed: "Water could not be logged.",
    plannedCompleteFailed: "Planned item could not be completed.", meals: "Meals",
  },
  de: {
    description: "Tatsächliche Aufnahme für den ausgewählten Tag.", actual: "Tatsächlich", ofTarget: "von {target} Ziel",
    actualUnavailable: "Die tatsächliche Aufnahme ist vorübergehend nicht verfügbar.", planned: "Geplant",
    plannedDescription: "Die Absicht bleibt getrennt, bis du sie ausdrücklich als gegessen markierst.", nothingLogged: "Nichts protokolliert.",
    historicalOther: "Historische Kompatibilitätsmahlzeit", loadFailed: "Das Tagebuch konnte nicht geladen werden.",
    plannedMissing: "Der geplante Eintrag ist für „Mit Änderungen protokollieren“ nicht mehr verfügbar.", waterFailed: "Wasser konnte nicht protokolliert werden.",
    plannedCompleteFailed: "Der geplante Eintrag konnte nicht abgeschlossen werden.", meals: "Mahlzeiten",
  },
  ar: {
    description: "المدخول الفعلي لليوم المحدد.", actual: "الفعلي", ofTarget: "من هدف {target}",
    actualUnavailable: "المدخول الفعلي غير متاح مؤقتًا.", planned: "المخطط",
    plannedDescription: "تظل النية منفصلة حتى تحددها صراحةً كمأكولة.", nothingLogged: "لا يوجد شيء مسجل.",
    historicalOther: "وجبة توافق تاريخية", loadFailed: "تعذر تحميل اليوميات.",
    plannedMissing: "العنصر المخطط لم يعد متاحًا للتسجيل مع التغييرات.", waterFailed: "تعذر تسجيل الماء.",
    plannedCompleteFailed: "تعذر إكمال العنصر المخطط.", meals: "الوجبات",
  },
} as const;

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function headers(token?: string | null, json = false) {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

function nutritionValue(value: number | null, unit: string, unavailable: string) {
  return value === null ? unavailable : `${Math.round(value * 10) / 10}${unit}`;
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
  const { et, mealLabel } = useEatTranslation();
  const { nt, language, dir } = useNutritionV1Translation();
  const copy = diaryCopy[language];
  const rawDate = searchParams.get("date");
  const plannedOccurrenceId = searchParams.get("plannedOccurrence");
  const date = rawDate && isIsoDate(rawDate) ? rawDate : today;
  const [projection, setProjection] = useState<DiaryProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [waterPending, setWaterPending] = useState(false);
  const waterIntentRef = useRef<WaterLogIntent | null>(null);
  const [planPending, setPlanPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/nutrition/v1/diary?date=${encodeURIComponent(date)}`, { headers: headers(token) });
      if (!response.ok) throw new Error(copy.loadFailed);
      setProjection(await response.json() as DiaryProjection);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed, date, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (rawDate !== date) router.replace(`/calories?date=${encodeURIComponent(date)}`, { scroll: false }); }, [date, rawDate, router]);

  const actualDomain = projection?.domains.actual;
  const logs = useMemo(() => actualDomain?.status === "ready" ? actualDomain.data.logs : [], [actualDomain]);
  const remaining = projection?.position.remaining ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const actual = projection?.position.actual ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const target = projection?.position.target ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const planned = useMemo(() => projection?.domains.planned.status === "ready" ? projection.domains.planned.data : [], [projection]);
  const plannedOccurrence = useMemo(() => plannedOccurrenceId ? planned.find((item) => item.id === plannedOccurrenceId && item.status === "planned") ?? null : null, [planned, plannedOccurrenceId]);
  const hydration = projection?.domains.hydration.status === "ready" ? projection.domains.hydration.data : null;
  const savedMeals = projection?.domains.savedMeals.status === "ready" ? projection.domains.savedMeals.data : [];
  const targetWater = projection?.domains.target.status === "ready" && projection.domains.target.data.available ? projection.domains.target.data.values?.water_ml ?? null : null;
  const otherMealLogs = logs.filter((log) => log.mealType.toLowerCase() === "other");

  useEffect(() => {
    if (!plannedOccurrenceId || !projection || loading) return;
    if (!plannedOccurrence) {
      setError(copy.plannedMissing);
      return;
    }
    setLoggingMeal(plannedOccurrence.mealType);
  }, [copy.plannedMissing, loading, plannedOccurrence, plannedOccurrenceId, projection]);

  function clearPlannedOccurrenceIntent() {
    if (!plannedOccurrenceId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("plannedOccurrence");
    if (!next.get("date")) next.set("date", date);
    router.replace(`/calories?${next.toString()}`, { scroll: false });
  }

  function closeLoggingSession() {
    setLoggingMeal(null);
    clearPlannedOccurrenceIntent();
  }

  function selectDate(next: string) {
    router.push(`/calories?date=${encodeURIComponent(next)}`, { scroll: false });
  }

  async function addWater(amountMl: number) {
    if (waterPending) return;
    const intent = resolveWaterLogIntent(waterIntentRef.current, {
      ownerId: session?.user.id ?? "",
      date,
      amountMl,
    });
    waterIntentRef.current = intent;
    setWaterPending(true);
    try {
      const response = await fetch("/api/nutrition/v1/diary", {
        method: "POST",
        headers: headers(token, true),
        body: JSON.stringify({ kind: "water", date, amountMl, operationId: intent.operationId }),
      });
      if (!response.ok) throw new Error();
      waterIntentRef.current = null;
      await load();
    } catch {
      setError(copy.waterFailed);
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
      setError(copy.plannedCompleteFailed);
    } finally {
      setPlanPending(null);
    }
  }

  const unavailable = nt("notAvailable");
  const kcal = (value: number | null) => nutritionValue(value, " kcal", unavailable);
  const grams = (value: number | null) => nutritionValue(value, "g", unavailable);

  return (
    <main dir={dir} className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <header className="border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{nt("diary")}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div><button type="button" onClick={() => setLoggingMeal("Snack")} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background"><Plus className="h-4 w-4" />{et("addFood")}</button></div>
        <div className="mt-4 flex items-center gap-2"><button type="button" onClick={() => selectDate(shiftDate(date, -1))} className="inline-flex min-h-[45px] min-w-[45px] items-center justify-center rounded-xl border border-border" aria-label={et("previousDay")}><ChevronLeft className="h-4 w-4" /></button><input type="date" value={date} onChange={(event) => event.target.value && selectDate(event.target.value)} className="min-h-[45px] rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" onClick={() => selectDate(shiftDate(date, 1))} className="inline-flex min-h-[45px] min-w-[45px] items-center justify-center rounded-xl border border-border" aria-label={et("nextDay")}><ChevronRight className="h-4 w-4" /></button>{date !== today ? <button type="button" onClick={() => selectDate(today)} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">{nt("today")}</button> : null}</div>
      </header>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {loading && !projection ? <div className="mt-5 space-y-3" aria-label={et("loading")}><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-24 animate-pulse rounded-2xl bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div> : null}

      {projection ? <>
        <section className="mt-5 border-b border-border pb-5" aria-labelledby="actual-heading">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.actual}</p><h2 id="actual-heading" className="mt-1 text-2xl font-semibold">{kcal(actual.caloriesKcal)}</h2><p className="text-sm text-muted-foreground">{copy.ofTarget.replace("{target}", kcal(target.caloriesKcal))}</p></div><div className="text-end"><p className="text-xs text-muted-foreground">{et("remaining")}</p><p className="text-lg font-semibold">{kcal(remaining.caloriesKcal)}</p></div></div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><p className="text-muted-foreground">{et("protein")}</p><p className="font-medium">{grams(actual.proteinG)} / {grams(target.proteinG)}</p></div><div><p className="text-muted-foreground">{et("carbs")}</p><p className="font-medium">{grams(actual.carbsG)} / {grams(target.carbsG)}</p></div><div><p className="text-muted-foreground">{et("fat")}</p><p className="font-medium">{grams(actual.fatG)} / {grams(target.fatG)}</p></div></div>
          {actualDomain?.status === "unavailable" ? <p className="mt-3 text-sm text-destructive">{copy.actualUnavailable}</p> : null}
        </section>

        <section className="border-b border-border py-5" aria-labelledby="water-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="water-heading" className="font-semibold">{et("water")}</h2><p className="text-sm text-muted-foreground">{hydration ? `${hydration.totalMl} ml` : unavailable}{targetWater === null ? "" : ` / ${targetWater} ml`}</p></div><div className="flex gap-2"><button type="button" disabled={waterPending} onClick={() => void addWater(250)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">+250 ml</button><button type="button" disabled={waterPending} onClick={() => void addWater(500)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">+500 ml</button></div></div></section>

        {planned.length ? <section className="border-b border-border py-5" aria-labelledby="planned-heading"><h2 id="planned-heading" className="font-semibold">{copy.planned}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.plannedDescription}</p><div className="mt-3 divide-y divide-border">{planned.map((item) => <div key={item.id} className="flex min-h-14 items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium"><bdi dir="auto">{item.name}</bdi></p><p className="text-xs text-muted-foreground">{mealLabel(item.mealType)} · {item.status.replace("_", " ")}</p></div>{item.status === "planned" ? <button type="button" disabled={planPending === item.id} onClick={() => void markEaten(item.id)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">{et("markEaten")}</button> : null}</div>)}</div></section> : null}

        <section className="py-2" aria-label={copy.meals}>{standardMeals.map((meal) => { const rows = mealLogs(logs, meal); const label = mealLabel(meal); return <div key={meal} className="border-b border-border py-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{label}</h2><button type="button" onClick={() => setLoggingMeal(meal)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />{et("addFood")}</button></div>{rows.length ? <div className="mt-2 divide-y divide-border">{rows.map((log) => <div key={log.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium"><bdi dir="auto">{log.foodName}</bdi></p><p className="text-xs text-muted-foreground">{log.quantity} × <bdi dir="auto">{log.servingLabel}</bdi></p></div><p className="shrink-0 text-sm font-medium">{kcal(log.nutrition.caloriesKcal)}</p></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">{copy.nothingLogged}</p>}</div>; })}
          {otherMealLogs.length ? <div className="border-b border-border py-4"><h2 className="font-semibold">{et("other")}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.historicalOther}</p><div className="mt-2 divide-y divide-border">{otherMealLogs.map((log) => <div key={log.id} className="flex min-h-14 items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium"><bdi dir="auto">{log.foodName}</bdi></p><p className="text-xs text-muted-foreground">{log.quantity} × <bdi dir="auto">{log.servingLabel}</bdi></p></div><p className="text-sm font-medium">{kcal(log.nutrition.caloriesKcal)}</p></div>)}</div></div> : null}
        </section>
      </> : null}

      {loggingMeal ? <LoggingSession date={date} meal={loggingMeal} savedMeals={savedMeals} plannedOccurrence={plannedOccurrence} onClose={closeLoggingSession} onConfirmed={() => { setLoggingMeal(null); clearPlannedOccurrenceIntent(); void load(); }} /> : null}
    </main>
  );
}
