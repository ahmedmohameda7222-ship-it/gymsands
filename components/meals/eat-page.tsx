"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Loader2, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { EatAddFoodSurface } from "@/components/meals/eat-add-food-surface";
import { EatFoodLog } from "@/components/meals/eat-food-log";
import { EatPlannedMealAdjust } from "@/components/meals/eat-planned-meal-adjust";
import { EatWeekView } from "@/components/meals/eat-week-view";
import { CompactHydration, EatNutritionProgress, PlannedNextMeal, RemainingToday, RepeatFoodSection } from "@/components/meals/eat-day-sections";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addIsoDays, buildNutritionMetrics, parseEatDate, parseEatView, rankRepeatFoods, selectNextPlannedMeal, suggestMealType, sumEatLogs, type EatView, type RepeatFoodOption, type SourceState } from "@/lib/eat/eat-model";
import { useEatTranslation } from "@/lib/i18n/eat";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getFavoriteFoodKeysAsync } from "@/services/meals/food-logging-speed";
import { getCalorieTargets } from "@/services/database/nutrition";
import { addWaterLog } from "@/services/database/nutrition";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { completeMealPlanItemWithDraft, getEatFoodLogs, getEatMealPlanItems, getEatRecentFoodLogs, getEatWaterLogs, getEatWeek, logRepeatFood, type EatFoodLogPatch } from "@/services/database/eat";
import { getActiveTargetOverride, resolveActiveNutritionTarget, type ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { DailyNutritionSummary, FoodLog, MealPlanItem, MealType, WaterLog } from "@/types";

const loadingLogs: SourceState<FoodLog[]> = { status: "loading" };
const loadingWater: SourceState<WaterLog[]> = { status: "loading" };
const loadingMeals: SourceState<MealPlanItem[]> = { status: "loading" };
const loadingRepeats: SourceState<RepeatFoodOption[]> = { status: "loading" };
const loadingWeek: SourceState<DailyNutritionSummary[]> = { status: "loading" };
const loadingTarget: SourceState<ActiveNutritionTarget | null> = { status: "loading" };

type AddFoodStart = "home" | "repeat" | "search" | "saved-meals" | "barcode" | "custom" | "photo" | "copy-day";

export function EatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = useTodayDate();
  const { settings } = useUserSettings();
  const { et, formatDate, mealLabel, dir } = useEatTranslation();
  const { openPrompts, setDashboardContext, dashboardContext } = useQuickChatGpt();

  const rawDate = searchParams.get("date");
  const rawView = searchParams.get("view");
  const selectedDate = parseEatDate(rawDate, today);
  const view = parseEatView(rawView);

  const [logs, setLogs] = useState<SourceState<FoodLog[]>>(loadingLogs);
  const [water, setWater] = useState<SourceState<WaterLog[]>>(loadingWater);
  const [plannedMeals, setPlannedMeals] = useState<SourceState<MealPlanItem[]>>(loadingMeals);
  const [repeats, setRepeats] = useState<SourceState<RepeatFoodOption[]>>(loadingRepeats);
  const [week, setWeek] = useState<SourceState<DailyNutritionSummary[]>>(loadingWeek);
  const [activeTarget, setActiveTarget] = useState<SourceState<ActiveNutritionTarget | null>>(loadingTarget);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addFoodMeal, setAddFoodMeal] = useState<MealType>("Lunch");
  const [addFoodStart, setAddFoodStart] = useState<AddFoodStart>("home");
  const [repeatPending, setRepeatPending] = useState<string | null>(null);
  const [repeatFeedback, setRepeatFeedback] = useState("");
  const [waterPending, setWaterPending] = useState(false);
  const [waterFeedback, setWaterFeedback] = useState("");
  const [plannedPending, setPlannedPending] = useState<string | null>(null);
  const [adjustingMeal, setAdjustingMeal] = useState<MealPlanItem | null>(null);
  const [adjustError, setAdjustError] = useState("");

  const setUrl = useCallback((date: string, nextView: EatView, replace = false) => {
    const href = `${pathname}?date=${encodeURIComponent(date)}&view=${nextView}`;
    if (replace) router.replace(href, { scroll: false }); else router.push(href, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const validView = rawView === "day" || rawView === "week";
    if (rawDate !== selectedDate || !validView) setUrl(selectedDate, view, true);
  }, [rawDate, rawView, selectedDate, setUrl, view]);

  const loadLogs = useCallback(async () => {
    if (!user?.id) return;
    setLogs((current) => ({ status: "loading", data: current.status === "loaded" ? current.data : current.data }));
    try { setLogs({ status: "loaded", data: await getEatFoodLogs(user.id, selectedDate) }); }
    catch (error) { setLogs({ status: "failed", error: error instanceof Error ? error.message : et("logsFailed") }); }
  }, [et, selectedDate, user?.id]);

  const loadWater = useCallback(async () => {
    if (!user?.id) return;
    setWater((current) => ({ status: "loading", data: current.status === "loaded" ? current.data : current.data }));
    try { setWater({ status: "loaded", data: await getEatWaterLogs(user.id, selectedDate) }); }
    catch (error) { setWater({ status: "failed", error: error instanceof Error ? error.message : et("waterFailed") }); }
  }, [et, selectedDate, user?.id]);

  const loadPlannedMeals = useCallback(async () => {
    if (!user?.id) return;
    setPlannedMeals((current) => ({ status: "loading", data: current.status === "loaded" ? current.data : current.data }));
    try { setPlannedMeals({ status: "loaded", data: await getEatMealPlanItems(user.id, selectedDate) }); }
    catch (error) { setPlannedMeals({ status: "failed", error: error instanceof Error ? error.message : et("plannedFailed") }); }
  }, [et, selectedDate, user?.id]);

  const loadRepeats = useCallback(async () => {
    if (!user?.id) return;
    setRepeats((current) => ({ status: "loading", data: current.status === "loaded" ? current.data : current.data }));
    const [recent, favorites] = await Promise.allSettled([getEatRecentFoodLogs(user.id), getFavoriteFoodKeysAsync(user.id)]);
    if (recent.status === "rejected") { setRepeats({ status: "failed", error: recent.reason instanceof Error ? recent.reason.message : et("repeatsFailed") }); return; }
    setRepeats({ status: "loaded", data: rankRepeatFoods(recent.value, favorites.status === "fulfilled" ? favorites.value : [], 6) });
  }, [et, user?.id]);

  const loadWeek = useCallback(async () => {
    if (!user?.id) return;
    setWeek((current) => ({ status: "loading", data: current.status === "loaded" ? current.data : current.data }));
    try { setWeek({ status: "loaded", data: await getEatWeek(user.id, selectedDate) }); }
    catch (error) { setWeek({ status: "failed", error: error instanceof Error ? error.message : et("weekFailed") }); }
  }, [et, selectedDate, user?.id]);

  const loadTarget = useCallback(async () => {
    if (!user?.id) return;
    setActiveTarget((current) => ({ status: "loading", data: current.status === "loaded" ? current.data : current.data }));
    const [baseResult, profilesResult, planResult] = await Promise.allSettled([
      getCalorieTargets(user.id, { throwOnError: true }),
      user.id === "mock-user" ? Promise.resolve([]) : getNutritionTargetProfiles(user.id),
      getDefaultUserWorkoutPlan(user.id)
    ]);
    if (baseResult.status === "rejected" || profilesResult.status === "rejected") { setActiveTarget({ status: "failed", error: et("targetsFailed") }); return; }
    const override = getActiveTargetOverride(user.id, selectedDate);
    if (override === "auto" && planResult.status === "rejected") { setActiveTarget({ status: "failed", error: et("targetsFailed") }); return; }
    const weekday = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
    const detected = planResult.status === "fulfilled" && planResult.value?.days.some((day) => day.weekday === weekday && day.exercises.length > 0) ? "training_day" : "rest_day";
    setActiveTarget({ status: "loaded", data: resolveActiveNutritionTarget({ profiles: profilesResult.value, baseTarget: baseResult.value, requestedType: override === "auto" ? detected : override }) });
  }, [et, selectedDate, user?.id]);

  useEffect(() => { void loadLogs(); void loadWater(); void loadPlannedMeals(); void loadTarget(); }, [loadLogs, loadPlannedMeals, loadTarget, loadWater]);
  useEffect(() => { void loadRepeats(); }, [loadRepeats]);
  useEffect(() => { void loadWeek(); }, [loadWeek]);

  const loadedLogs = logs.data ?? [];
  const loadedWater = water.data ?? [];
  const loadedMeals = plannedMeals.data ?? [];
  const repeatOptions = repeats.data ?? [];
  const totals = useMemo(() => sumEatLogs(loadedLogs), [loadedLogs]);
  const targetValues = activeTarget.status === "loaded" && activeTarget.data?.hasTarget ? activeTarget.data.values : null;
  const metrics = useMemo(() => buildNutritionMetrics({ consumed: totals, targets: targetValues, logsAvailable: logs.status === "loaded", targetsAvailable: activeTarget.status === "loaded" && Boolean(activeTarget.data?.hasTarget) }), [activeTarget, logs.status, targetValues, totals]);
  const suggestedMeal = suggestMealType(selectedDate, today, new Date().getHours());
  const nextMeal = plannedMeals.status === "loaded" ? selectNextPlannedMeal(plannedMeals.data, selectedDate, today, new Date().getHours()) : null;
  const targetLabel = activeTarget.status === "loaded" ? activeTarget.data?.label ?? et("targetUnavailable") : activeTarget.status === "failed" ? et("targetUnavailable") : "…";

  useEffect(() => {
    const calorieMetric = metrics.find((metric) => metric.key === "calories");
    const proteinMetric = metrics.find((metric) => metric.key === "protein_g");
    setDashboardContext({
      ...dashboardContext,
      route: "/calories",
      today: selectedDate,
      localHour: new Date().getHours(),
      units: { energy: settings.energyUnit, liquid: settings.liquidUnit, weight: settings.weightUnit },
      nutrition: {
        hasTargets: Boolean(activeTarget.status === "loaded" && activeTarget.data?.hasTarget),
        targetsState: activeTarget.status === "loading" ? "loading" : activeTarget.status === "failed" ? "failed" : "loaded",
        foodLogsState: logs.status === "loading" ? "loading" : logs.status === "failed" ? "failed" : "loaded",
        remainingCalories: calorieMetric?.remaining ?? null,
        remainingProtein: proteinMetric?.remaining ?? null,
        foodLogCount: logs.status === "loaded" ? logs.data.length : null,
        mealPlanCount: plannedMeals.status === "loaded" ? plannedMeals.data.length : null
      },
      hydration: { state: water.status === "loading" ? "loading" : water.status === "failed" ? "failed" : "loaded", hasTarget: Boolean(targetValues?.water_ml), logCount: water.status === "loaded" ? water.data.length : null, remainingMl: water.status === "loaded" && targetValues?.water_ml ? targetValues.water_ml - water.data.reduce((sum, log) => sum + Number(log.amount_ml), 0) : null },
      selection: { ...dashboardContext.selection, meal: nextMeal?.food_name ?? null }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTarget, logs, metrics, nextMeal?.food_name, plannedMeals, selectedDate, settings.energyUnit, settings.liquidUnit, settings.weightUnit, water]);

  function openAddFood(mealType: MealType = suggestedMeal, start: AddFoodStart = "home") { setAddFoodMeal(mealType); setAddFoodStart(start); setAddFoodOpen(true); }

  function mergeLogged(nextLogs: FoodLog[]) {
    if (!nextLogs.length) return;
    setLogs((current) => {
      const existing = current.data ?? [];
      const map = new Map(existing.map((log) => [log.id, log]));
      nextLogs.filter((log) => log.log_date === selectedDate).forEach((log) => map.set(log.id, log));
      return { status: "loaded", data: Array.from(map.values()).sort((a, b) => String(b.id).localeCompare(String(a.id))) };
    });
    void loadWeek(); void loadPlannedMeals();
  }

  async function repeatFood(option: RepeatFoodOption) {
    if (!user?.id || repeatPending) return;
    setRepeatPending(option.repeatKey); setRepeatFeedback(et("logging"));
    try { const log = await logRepeatFood(user.id, option, selectedDate, addFoodMeal); mergeLogged([log]); setRepeatFeedback(et("logged")); }
    catch (error) { setRepeatFeedback(error instanceof Error ? error.message : et("saveFailed")); }
    finally { setRepeatPending(null); }
  }

  async function addWater(amountMl: number) {
    if (!user?.id || waterPending || water.status !== "loaded") return;
    const previous = water.data;
    const optimistic: WaterLog = { id: `optimistic-${Date.now()}`, user_id: user.id, log_date: selectedDate, amount_ml: amountMl, created_at: new Date().toISOString() };
    setWaterPending(true); setWaterFeedback(`${amountMl} ml…`); setWater({ status: "loaded", data: [optimistic, ...previous] });
    try { const saved = await addWaterLog(user.id, selectedDate, amountMl); setWater({ status: "loaded", data: [saved, ...previous] }); setWaterFeedback(et("successSaved")); }
    catch (error) { setWater({ status: "loaded", data: previous }); setWaterFeedback(error instanceof Error ? error.message : et("saveFailed")); }
    finally { setWaterPending(false); }
  }

  async function completePlanned(item: MealPlanItem, patch?: EatFoodLogPatch, updatePlan = false) {
    if (plannedPending) return;
    const defaultPatch: EatFoodLogPatch = patch ?? { foodName: item.food_name, quantity: item.quantity, servingSize: item.serving_size, mealType: item.meal_type, calories: item.calories, proteinG: item.protein_g, carbsG: item.carbs_g, fatG: item.fat_g, notes: item.notes };
    setPlannedPending(item.id); setAdjustError("");
    try {
      const result = await completeMealPlanItemWithDraft({ item, patch: defaultPatch, updateSavedPlan: updatePlan });
      if (result.log) mergeLogged([result.log]);
      setPlannedMeals((current) => ({ status: "loaded", data: (current.data ?? []).map((planned) => planned.id === result.item.id ? result.item : planned) }));
      setAdjustingMeal(null); void loadWeek();
    } catch (error) { setAdjustError(error instanceof Error ? error.message : et("saveFailed")); }
    finally { setPlannedPending(null); }
  }

  function replacePlanned(item: MealPlanItem) {
    setDashboardContext({ ...dashboardContext, today: selectedDate, selection: { ...dashboardContext.selection, meal: item.food_name } });
    openPrompts("replace-meal");
  }

  return <div className="space-y-4 pb-28 lg:pb-8" dir={dir}>
    <header className="space-y-4 rounded-[20px] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="text-3xl font-extrabold tracking-tight">{et("eat")}</h1><p className="mt-1 text-sm text-muted-foreground">{formatDate(selectedDate)} · {targetLabel}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><Button type="button" variant="outline" className="min-h-12" onClick={() => openPrompts()}><Sparkles className="h-4 w-4" />{et("askChatGpt")}</Button><Button type="button" className="min-h-12" onClick={() => openAddFood()}><Plus className="h-4 w-4" />{et("addFood")}</Button></div>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] gap-2"><Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" onClick={() => setUrl(addIsoDays(selectedDate, -1), view)} aria-label={et("previousDay")}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button><label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted-foreground rtl:left-auto rtl:right-3" /><input type="date" value={selectedDate} onChange={(event) => setUrl(parseEatDate(event.target.value, today), view)} className="h-12 w-full rounded-[14px] border border-input bg-card px-10 text-center text-sm font-semibold" aria-label={et("date")} /></label><Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" onClick={() => setUrl(addIsoDays(selectedDate, 1), view)} aria-label={et("nextDay")}><ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button></div>
      <div className="grid grid-cols-2 rounded-[14px] bg-muted p-1"><button type="button" aria-pressed={view === "day"} className={`min-h-11 rounded-[11px] text-sm font-semibold ${view === "day" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => setUrl(selectedDate, "day")}>{et("day")}</button><button type="button" aria-pressed={view === "week"} className={`min-h-11 rounded-[11px] text-sm font-semibold ${view === "week" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => setUrl(selectedDate, "week")}>{et("week")}</button></div>
    </header>

    {view === "day" ? <>
      <EatNutritionProgress metrics={metrics} activeTarget={activeTarget} selectedDate={selectedDate} energyUnit={settings.energyUnit} onRetryTargets={() => void loadTarget()} />
      {plannedMeals.status === "failed" ? <SourceFailure message={et("plannedFailed")} onRetry={() => void loadPlannedMeals()} /> : <PlannedNextMeal item={nextMeal} pending={plannedPending === nextMeal?.id} onMarkEaten={(item) => void completePlanned(item)} onAdjust={(item) => setAdjustingMeal(item)} onReplace={replacePlanned} />}
      {repeats.status === "failed" ? <SourceFailure message={et("repeatsFailed")} onRetry={() => void loadRepeats()} /> : <RepeatFoodSection options={repeatOptions} selectedDate={selectedDate} mealType={addFoodMeal} pendingKey={repeatPending} feedback={repeatFeedback} onMealTypeChange={setAddFoodMeal} onRepeat={(option) => void repeatFood(option)} onViewAll={() => openAddFood(addFoodMeal, "repeat")} />}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <EatFoodLog userId={user?.id ?? ""} logs={loadedLogs} mealPlanItems={loadedMeals} loading={logs.status === "loading"} error={logs.status === "failed" ? logs.error : undefined} onRetry={() => void loadLogs()} onAdd={(meal) => openAddFood(meal)} onChanged={(next) => { setLogs({ status: "loaded", data: next }); void loadWeek(); void loadPlannedMeals(); }} />
        <aside className="space-y-4"><RemainingToday metrics={metrics} /><CompactHydration water={water} waterTargetMl={targetValues?.water_ml ?? null} liquidUnit={settings.liquidUnit} pending={waterPending} feedback={waterFeedback} onAdd={(amount) => void addWater(amount)} onRetry={() => void loadWater()} /></aside>
      </div>
    </> : <EatWeekView week={week} selectedDate={selectedDate} targetCalories={targetValues?.daily_calories ?? null} onMoveWeek={(days) => setUrl(addIsoDays(selectedDate, days), "week")} onSelectDate={(date) => setUrl(date, "week")} onAddFood={() => openAddFood()} onRetry={() => void loadWeek()} />}

    <EatAddFoodSurface open={addFoodOpen} onOpenChange={setAddFoodOpen} selectedDate={selectedDate} initialMealType={addFoodMeal} initialView={addFoodStart} repeats={repeatOptions} targetLogs={loadedLogs} onFoodLogged={mergeLogged} onPhotoPrompt={(date, meal) => { setDashboardContext({ ...dashboardContext, today: date, selection: { ...dashboardContext.selection, meal } }); openPrompts("estimate-meal-photo"); }} />
    <EatPlannedMealAdjust item={adjustingMeal} open={Boolean(adjustingMeal)} pending={Boolean(plannedPending)} error={adjustError} onOpenChange={(next) => { if (!next) { setAdjustingMeal(null); setAdjustError(""); } }} onConfirm={(patch, updatePlan) => { if (adjustingMeal) void completePlanned(adjustingMeal, patch, updatePlan); }} />
  </div>;
}

function SourceFailure({ message, onRetry }: { message: string; onRetry: () => void }) { return <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-destructive">{message}</p><Button type="button" variant="outline" onClick={onRetry}>Retry</Button></CardContent></Card>; }
