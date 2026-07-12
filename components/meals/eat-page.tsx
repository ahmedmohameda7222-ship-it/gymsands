"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { EatAddFoodSurface } from "@/components/meals/eat-add-food-surface";
import { EatFoodLog } from "@/components/meals/eat-food-log";
import { EatPlannedMealAdjust } from "@/components/meals/eat-planned-meal-adjust";
import { EatWeekView } from "@/components/meals/eat-week-view";
import { CompactHydration, EatNutritionProgress, PlannedNextMeal, RepeatFoodSection } from "@/components/meals/eat-day-sections";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildPlannedMealPromptContext } from "@/lib/ai/planned-meal-context";
import { formatEatLiquid } from "@/lib/eat/eat-units";
import { addIsoDays, buildNutritionMetrics, parseEatDate, parseEatView, rankRepeatFoods, selectNextPlannedMeal, suggestMealType, sumEatLogs, type EatView, type EatWeekTargetDay, type RepeatFoodOption, type SourceState } from "@/lib/eat/eat-model";
import { useEatTranslation } from "@/lib/i18n/eat";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getFavoriteFoodKeysAsync } from "@/services/meals/food-logging-speed";
import { addWaterLog } from "@/services/database/nutrition";
import { completeMealPlanItemWithDraft, getEatFoodLogs, getEatMealPlanItems, getEatRecentFoodLogs, getEatWaterLogs, getEatWeek, logRepeatFood, type EatFoodLogPatch } from "@/services/database/eat";
import { getEatTargetForDate, getEatWeekTargets } from "@/services/database/eat-targets";
import { ACTIVE_NUTRITION_TARGET_EVENT } from "@/services/database/nutrition-target-assignments";
import { getPlannedMealPromptContext } from "@/services/database/planned-meal-prompt-context";
import type { ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { DailyNutritionSummary, FoodLog, MealPlanItem, MealType, WaterLog } from "@/types";

const loadingLogs: SourceState<FoodLog[]> = { status: "loading" };
const loadingWater: SourceState<WaterLog[]> = { status: "loading" };
const loadingMeals: SourceState<MealPlanItem[]> = { status: "loading" };
const loadingRepeats: SourceState<RepeatFoodOption[]> = { status: "loading" };
const loadingWeek: SourceState<DailyNutritionSummary[]> = { status: "loading" };
const loadingWeekTargets: SourceState<EatWeekTargetDay[]> = { status: "loading" };
const loadingTarget: SourceState<ActiveNutritionTarget | null> = { status: "loading" };
type AddFoodStart = "home" | "repeat" | "search" | "saved-meals" | "barcode" | "custom" | "photo" | "copy-day";

function localizedTargetLabel(target: ActiveNutritionTarget | null | undefined, et: ReturnType<typeof useEatTranslation>["et"]) {
  if (!target?.hasTarget) return et("targetUnavailable");
  if (target.sourceType === "training_day") return et("trainingTarget");
  if (target.sourceType === "rest_day") return et("restTarget");
  if (target.sourceType === "high_activity_day") return et("highActivityTarget");
  return et("fallbackTarget");
}

export function EatPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = useTodayDate();
  const { settings } = useUserSettings();
  const { et, formatDate, dir, locale } = useEatTranslation();
  const { openPrompts, setDashboardContext, dashboardContext } = useQuickChatGpt();
  const rawDate = searchParams.get("date");
  const rawView = searchParams.get("view");
  const selectedDate = parseEatDate(rawDate, today);
  const view = parseEatView(rawView);
  const initialSuggestedMeal = suggestMealType(selectedDate, today, new Date().getHours());

  const [logs, setLogs] = useState<SourceState<FoodLog[]>>(loadingLogs);
  const [water, setWater] = useState<SourceState<WaterLog[]>>(loadingWater);
  const [plannedMeals, setPlannedMeals] = useState<SourceState<MealPlanItem[]>>(loadingMeals);
  const [repeats, setRepeats] = useState<SourceState<RepeatFoodOption[]>>(loadingRepeats);
  const [week, setWeek] = useState<SourceState<DailyNutritionSummary[]>>(loadingWeek);
  const [weekTargets, setWeekTargets] = useState<SourceState<EatWeekTargetDay[]>>(loadingWeekTargets);
  const [activeTarget, setActiveTarget] = useState<SourceState<ActiveNutritionTarget | null>>(loadingTarget);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [addFoodMeal, setAddFoodMeal] = useState<MealType>(initialSuggestedMeal);
  const [addFoodStart, setAddFoodStart] = useState<AddFoodStart>("home");
  const [repeatPending, setRepeatPending] = useState<string | null>(null);
  const [repeatFeedback, setRepeatFeedback] = useState("");
  const [waterPending, setWaterPending] = useState(false);
  const [waterFeedback, setWaterFeedback] = useState("");
  const [plannedPending, setPlannedPending] = useState<string | null>(null);
  const [chatGptMealPending, setChatGptMealPending] = useState<string | null>(null);
  const [adjustingMeal, setAdjustingMeal] = useState<MealPlanItem | null>(null);
  const [adjustError, setAdjustError] = useState("");

  const setUrl = useCallback((date: string, nextView: EatView, replace = false) => {
    const href = `${pathname}?date=${encodeURIComponent(date)}&view=${nextView}`;
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const validView = rawView === "day" || rawView === "week";
    if (rawDate !== selectedDate || !validView) setUrl(selectedDate, view, true);
  }, [rawDate, rawView, selectedDate, setUrl, view]);

  const loadLogs = useCallback(async () => {
    if (!userId) return;
    setLogs((current) => ({ status: "loading", data: current.data }));
    try { setLogs({ status: "loaded", data: await getEatFoodLogs(userId, selectedDate) }); }
    catch { setLogs({ status: "failed", error: et("logsFailed") }); }
  }, [et, selectedDate, userId]);
  const loadWater = useCallback(async () => {
    if (!userId) return;
    setWater((current) => ({ status: "loading", data: current.data }));
    try { setWater({ status: "loaded", data: await getEatWaterLogs(userId, selectedDate) }); }
    catch { setWater({ status: "failed", error: et("waterFailed") }); }
  }, [et, selectedDate, userId]);
  const loadPlannedMeals = useCallback(async () => {
    if (!userId) return;
    setPlannedMeals((current) => ({ status: "loading", data: current.data }));
    try { setPlannedMeals({ status: "loaded", data: await getEatMealPlanItems(userId, selectedDate) }); }
    catch { setPlannedMeals({ status: "failed", error: et("plannedFailed") }); }
  }, [et, selectedDate, userId]);
  const loadRepeats = useCallback(async () => {
    if (!userId) return;
    setRepeats((current) => ({ status: "loading", data: current.data }));
    const [recent, favorites] = await Promise.allSettled([getEatRecentFoodLogs(userId), getFavoriteFoodKeysAsync(userId)]);
    if (recent.status === "rejected") { setRepeats({ status: "failed", error: et("repeatsFailed") }); return; }
    setRepeats({ status: "loaded", data: rankRepeatFoods(recent.value, favorites.status === "fulfilled" ? favorites.value : [], 6) });
  }, [et, userId]);
  const loadWeek = useCallback(async () => {
    if (!userId) return;
    setWeek((current) => ({ status: "loading", data: current.data }));
    try { setWeek({ status: "loaded", data: await getEatWeek(userId, selectedDate) }); }
    catch { setWeek({ status: "failed", error: et("weekFailed") }); }
  }, [et, selectedDate, userId]);
  const loadWeekTargets = useCallback(async () => {
    if (!userId) return;
    setWeekTargets((current) => ({ status: "loading", data: current.data }));
    try { setWeekTargets({ status: "loaded", data: await getEatWeekTargets(userId, selectedDate) }); }
    catch { setWeekTargets({ status: "failed", error: et("targetsFailed") }); }
  }, [et, selectedDate, userId]);
  const loadTarget = useCallback(async () => {
    if (!userId) return;
    setActiveTarget((current) => ({ status: "loading", data: current.data }));
    try { setActiveTarget({ status: "loaded", data: await getEatTargetForDate(userId, selectedDate) }); }
    catch { setActiveTarget({ status: "failed", error: et("targetsFailed") }); }
  }, [et, selectedDate, userId]);

  useEffect(() => { void loadLogs(); void loadWater(); void loadPlannedMeals(); void loadTarget(); }, [loadLogs, loadPlannedMeals, loadTarget, loadWater]);
  useEffect(() => { void loadRepeats(); }, [loadRepeats]);
  useEffect(() => { void loadWeek(); void loadWeekTargets(); }, [loadWeek, loadWeekTargets]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ date?: string }>).detail;
      if (!detail?.date || detail.date === selectedDate) { void loadTarget(); void loadWeekTargets(); }
    };
    window.addEventListener(ACTIVE_NUTRITION_TARGET_EVENT, refresh);
    return () => window.removeEventListener(ACTIVE_NUTRITION_TARGET_EVENT, refresh);
  }, [loadTarget, loadWeekTargets, selectedDate]);

  const loadedLogs = useMemo(() => logs.data ?? [], [logs.data]);
  const loadedWater = useMemo(() => water.data ?? [], [water.data]);
  const loadedMeals = useMemo(() => plannedMeals.data ?? [], [plannedMeals.data]);
  const repeatOptions = useMemo(() => repeats.data ?? [], [repeats.data]);
  const totals = useMemo(() => sumEatLogs(loadedLogs), [loadedLogs]);
  const targetValues = activeTarget.status === "loaded" && activeTarget.data?.hasTarget ? activeTarget.data.values : null;
  const metrics = useMemo(() => buildNutritionMetrics({ consumed: totals, targets: targetValues, logsAvailable: logs.status === "loaded", targetsAvailable: activeTarget.status === "loaded" && Boolean(activeTarget.data?.hasTarget) }), [activeTarget, logs.status, targetValues, totals]);
  const suggestedMeal = suggestMealType(selectedDate, today, new Date().getHours());
  const nextMeal = plannedMeals.status === "loaded" ? selectNextPlannedMeal(plannedMeals.data, selectedDate, today, new Date().getHours()) : null;
  const targetLabel = activeTarget.status === "loaded" ? localizedTargetLabel(activeTarget.data, et) : activeTarget.status === "failed" ? et("targetUnavailable") : "…";
  const navigationStep = view === "week" ? 7 : 1;

  useEffect(() => { if (!addFoodOpen) setAddFoodMeal(suggestedMeal); }, [addFoodOpen, selectedDate, suggestedMeal]);
  useEffect(() => {
    const calorieMetric = metrics.find((metric) => metric.key === "calories");
    const proteinMetric = metrics.find((metric) => metric.key === "protein_g");
    const carbMetric = metrics.find((metric) => metric.key === "carbs_g");
    const fatMetric = metrics.find((metric) => metric.key === "fat_g");
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
        remainingCarbs: carbMetric?.remaining ?? null,
        remainingFat: fatMetric?.remaining ?? null,
        foodLogCount: logs.status === "loaded" ? logs.data.length : null,
        mealPlanCount: plannedMeals.status === "loaded" ? plannedMeals.data.length : null,
        plannedMealCount: plannedMeals.status === "loaded" ? plannedMeals.data.length : null
      },
      hydration: {
        state: water.status === "loading" ? "loading" : water.status === "failed" ? "failed" : "loaded",
        hasTarget: Boolean(targetValues?.water_ml),
        logCount: water.status === "loaded" ? water.data.length : null,
        remainingMl: water.status === "loaded" && targetValues?.water_ml ? targetValues.water_ml - loadedWater.reduce((sum, item) => sum + Number(item.amount_ml), 0) : null
      },
      selection: {
        ...dashboardContext.selection,
        meal: nextMeal?.food_name ?? null,
        plannedMeal: nextMeal ? buildPlannedMealPromptContext(nextMeal) : null
      }
    });
    // dashboardContext is the current cross-route base snapshot; including it would make this synchronization self-triggering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTarget, loadedWater, logs, metrics, nextMeal, plannedMeals, selectedDate, settings.energyUnit, settings.liquidUnit, settings.weightUnit, water]);

  function openAddFood(mealType: MealType = suggestedMeal, start: AddFoodStart = "home") {
    setAddFoodMeal(mealType); setAddFoodStart(start); setAddFoodOpen(true);
  }
  function mergeLogged(nextLogs: FoodLog[]) {
    if (!nextLogs.length) return;
    setLogs((current) => {
      const map = new Map((current.data ?? []).map((item) => [item.id, item]));
      nextLogs.filter((item) => item.log_date === selectedDate).forEach((item) => map.set(item.id, item));
      return { status: "loaded", data: Array.from(map.values()) };
    });
    void loadWeek(); void loadPlannedMeals();
  }
  async function repeatFood(option: RepeatFoodOption) {
    if (!userId || repeatPending) return;
    setRepeatPending(option.repeatKey); setRepeatFeedback(et("logging"));
    try { const saved = await logRepeatFood(userId, option, selectedDate, addFoodMeal); mergeLogged([saved]); setRepeatFeedback(et("logged")); }
    catch { setRepeatFeedback(et("saveFailed")); }
    finally { setRepeatPending(null); }
  }
  async function addWater(amountMl: number) {
    if (!userId || waterPending || water.status !== "loaded") return;
    const previous = water.data;
    const optimistic: WaterLog = { id: `optimistic-${Date.now()}`, user_id: userId, log_date: selectedDate, amount_ml: amountMl, created_at: new Date().toISOString() };
    setWaterPending(true); setWaterFeedback(et("waterShortcutSaving", { amount: formatEatLiquid(amountMl, settings.liquidUnit, locale) })); setWater({ status: "loaded", data: [optimistic, ...previous] });
    try { const saved = await addWaterLog(userId, selectedDate, amountMl); setWater({ status: "loaded", data: [saved, ...previous] }); setWaterFeedback(et("successSaved")); }
    catch { setWater({ status: "loaded", data: previous }); setWaterFeedback(et("saveFailed")); }
    finally { setWaterPending(false); }
  }
  async function completePlanned(item: MealPlanItem, patch?: EatFoodLogPatch, updatePlan = false) {
    if (plannedPending) return;
    const nextPatch: EatFoodLogPatch = patch ?? { foodName: item.food_name, quantity: item.quantity, servingSize: item.serving_size, mealType: item.meal_type, calories: item.calories, proteinG: item.protein_g, carbsG: item.carbs_g, fatG: item.fat_g, notes: item.notes };
    setPlannedPending(item.id); setAdjustError("");
    try {
      const result = await completeMealPlanItemWithDraft({ item, patch: nextPatch, updateSavedPlan: updatePlan });
      if (result.log) mergeLogged([result.log]);
      setPlannedMeals((current) => ({ status: "loaded", data: (current.data ?? []).map((planned) => planned.id === result.item.id ? result.item : planned) }));
      setAdjustingMeal(null); void loadWeek(); void loadWeekTargets();
    } catch { setAdjustError(et("saveFailed")); }
    finally { setPlannedPending(null); }
  }
  async function adjustPlannedWithChatGpt(item: MealPlanItem) {
    if (chatGptMealPending) return;
    setChatGptMealPending(item.id);
    try {
      const meal = await getPlannedMealPromptContext(item);
      setDashboardContext({ ...dashboardContext, today: selectedDate, selection: { ...dashboardContext.selection, meal: meal.name, plannedMeal: meal } });
      openPrompts({ source: "eat-planned-meal", mode: "meal-adjustment", selectedDate, meal });
    } finally { setChatGptMealPending(null); }
  }

  return <div className="space-y-4 pb-28 lg:pb-8" dir={dir}>
    <header className="space-y-4 rounded-[20px] border border-border/70 bg-card p-3 shadow-soft sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:gap-3 lg:flex lg:justify-between">
        <div className="min-w-0"><h1 className="text-3xl font-extrabold tracking-tight">{et("eat")}</h1><p className="mt-1 truncate text-sm text-muted-foreground">{formatDate(selectedDate)} · {targetLabel}</p></div>
        <div className="flex shrink-0 flex-nowrap gap-1.5 sm:gap-2"><Button type="button" variant="outline" className="min-h-12 whitespace-nowrap px-2.5 text-xs sm:px-4 sm:text-sm" onClick={() => openPrompts({ source: "eat", mode: "home", selectedDate })}><OpenAiBlossom className="h-4 w-4" />{et("askChatGpt")}</Button><Button type="button" className="min-h-12 whitespace-nowrap px-2.5 text-xs sm:px-4 sm:text-sm" onClick={() => openAddFood()}><Plus className="h-4 w-4" />{et("addFood")}</Button></div>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] gap-2"><Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" onClick={() => setUrl(addIsoDays(selectedDate, -navigationStep), view)} aria-label={view === "week" ? et("previousWeek") : et("previousDay")}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button><label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted-foreground rtl:left-auto rtl:right-3" /><input type="date" value={selectedDate} onChange={(event) => setUrl(parseEatDate(event.target.value, today), view)} className="h-12 w-full rounded-[14px] border border-input bg-card px-10 text-center text-sm font-semibold" aria-label={et("date")} /></label><Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" onClick={() => setUrl(addIsoDays(selectedDate, navigationStep), view)} aria-label={view === "week" ? et("nextWeek") : et("nextDay")}><ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button></div>
      <div className="grid grid-cols-2 rounded-[14px] bg-muted p-1"><button type="button" aria-pressed={view === "day"} className={`min-h-11 rounded-[11px] text-sm font-semibold ${view === "day" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => setUrl(selectedDate, "day")}>{et("day")}</button><button type="button" aria-pressed={view === "week"} className={`min-h-11 rounded-[11px] text-sm font-semibold ${view === "week" ? "bg-card shadow-sm" : "text-muted-foreground"}`} onClick={() => setUrl(selectedDate, "week")}>{et("week")}</button></div>
    </header>

    {view === "day" ? <>
      <EatNutritionProgress metrics={metrics} activeTarget={activeTarget} selectedDate={selectedDate} energyUnit={settings.energyUnit} onRetryTargets={() => void loadTarget()} />
      {plannedMeals.status === "failed" ? <SourceFailure message={et("plannedFailed")} retryLabel={et("retry")} onRetry={() => void loadPlannedMeals()} /> : <PlannedNextMeal item={nextMeal} pending={plannedPending === nextMeal?.id} chatGptPending={chatGptMealPending === nextMeal?.id} energyUnit={settings.energyUnit} onMarkEaten={(item) => void completePlanned(item)} onAdjust={setAdjustingMeal} onReplace={(item) => void adjustPlannedWithChatGpt(item)} />}
      {repeats.status === "failed" ? <SourceFailure message={et("repeatsFailed")} retryLabel={et("retry")} onRetry={() => void loadRepeats()} /> : <RepeatFoodSection options={repeatOptions} selectedDate={selectedDate} mealType={addFoodMeal} pendingKey={repeatPending} feedback={repeatFeedback} energyUnit={settings.energyUnit} onMealTypeChange={setAddFoodMeal} onRepeat={(option) => void repeatFood(option)} onViewAll={() => openAddFood(addFoodMeal, "repeat")} />}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <EatFoodLog userId={userId ?? ""} logs={loadedLogs} mealPlanItems={loadedMeals} loading={logs.status === "loading"} error={logs.status === "failed" ? logs.error : undefined} energyUnit={settings.energyUnit} onRetry={() => void loadLogs()} onReloadPlannedMeals={() => void loadPlannedMeals()} onAdd={(meal) => openAddFood(meal)} onChanged={(next) => { setLogs({ status: "loaded", data: next }); void loadWeek(); void loadPlannedMeals(); void loadWeekTargets(); }} />
        <aside className="space-y-4"><CompactHydration water={water} waterTargetMl={targetValues?.water_ml ?? null} liquidUnit={settings.liquidUnit} pending={waterPending} feedback={waterFeedback} onAdd={(amount) => void addWater(amount)} onRetry={() => void loadWater()} /></aside>
      </div>
    </> : <EatWeekView week={week} weekTargets={weekTargets} selectedDate={selectedDate} energyUnit={settings.energyUnit} onSelectDate={(date) => setUrl(date, "week")} onAddFood={() => openAddFood()} onRetryLogs={() => void loadWeek()} onRetryTargets={() => void loadWeekTargets()} />}

    <EatAddFoodSurface open={addFoodOpen} onOpenChange={setAddFoodOpen} selectedDate={selectedDate} initialMealType={addFoodMeal} initialView={addFoodStart} repeats={repeatOptions} targetLogs={loadedLogs} energyUnit={settings.energyUnit} onFoodLogged={mergeLogged} onPhotoPrompt={(date, meal) => { setDashboardContext({ ...dashboardContext, today: date, selection: { ...dashboardContext.selection, meal } }); openPrompts({ source: "eat", mode: "home", selectedDate: date, promptId: "estimate-meal-photo" }); }} />
    <EatPlannedMealAdjust item={adjustingMeal} open={Boolean(adjustingMeal)} pending={Boolean(plannedPending)} error={adjustError} energyUnit={settings.energyUnit} onOpenChange={(next) => { if (!next) { setAdjustingMeal(null); setAdjustError(""); } }} onConfirm={(patch, updatePlan) => { if (adjustingMeal) void completePlanned(adjustingMeal, patch, updatePlan); }} />
  </div>;
}

function SourceFailure({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-destructive">{message}</p><Button type="button" variant="outline" onClick={onRetry}>{retryLabel}</Button></CardContent></Card>;
}
