"use client";

import { BarChart3, ChefHat, Copy, Save, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodLogList } from "@/components/meals/food-log-list";
import { ApiFoodTools } from "@/components/meals/api-food-tools";
import { RecentFoodStrip } from "@/components/meals/recent-food-strip";
import { ChatGptMealImportReview } from "@/components/meals/chatgpt-meal-import-review";
import {
  NutritionCoachCard,
  SavedTarget,
  SelectField,
  TargetField,
  TrackerCard,
  WaterCard,
  WeeklyOverview,
  WeeklyTracker,
  formatDay,
  CompactNutritionSummary,
  WaterMiniSummary
} from "@/components/meals/calories-page-sections";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { CardGridSkeleton, ErrorState } from "@/components/ui/state-views";
import { userSafeError } from "@/lib/error-formatting";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addWaterLog,
  copyYesterdaysMeals,
  deleteWaterLog,
  getCalorieTargets,
  getNutritionWeek,
  getTodayFoodLogs,
  getWaterLogs,
  upsertCalorieTargets
} from "@/services/database/nutrition";
import { sumFoodLogs } from "@/services/nutrition/calculations";
import { estimateTdee, type SavedTargets } from "@/services/nutrition/targets";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { addDays, startOfWeek } from "@/lib/date-utils";

import type { DailyNutritionSummary, FoodLog, WaterLog } from "@/types";
import type { UserNutritionTargetProfile } from "@/types";
import { NutritionTargetProfiles } from "@/components/meals/nutrition-target-profiles";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getActiveTargetOverride, resolveActiveNutritionTarget, type ActiveNutritionTarget } from "@/services/nutrition/active-target";

export default function CaloriesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const today = useTodayDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [weekData, setWeekData] = useState<DailyNutritionSummary[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [targets, setTargets] = useState<SavedTargets | null>(null);
  const [activeTarget, setActiveTarget] = useState<ActiveNutritionTarget | null>(null);
  const [targetProfiles, setTargetProfiles] = useState<UserNutritionTargetProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [targetForm, setTargetForm] = useState({ dailyCalories: "", proteinG: "", carbsG: "", fatG: "", waterMl: "" });
  const [customWaterMl, setCustomWaterMl] = useState("250");
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const [activeTab, setActiveTab] = useState("today");
  const [copyStatus, setCopyStatus] = useState("");
  const [waterFeedback, setWaterFeedback] = useState("");
  const [waterFeedbackVariant, setWaterFeedbackVariant] = useState<"info" | "error">("info");
  const [waterPendingKey, setWaterPendingKey] = useState<string | null>(null);
  const [waterDeletingIds, setWaterDeletingIds] = useState<Set<string>>(new Set());
  const [wizard, setWizard] = useState({
    age: "",
    heightCm: "",
    weightKg: "",
    sex: "male" as "female" | "male",
    activityLevel: "moderate" as "sedentary" | "light" | "moderate" | "very_active",
    goal: "maintenance" as "fat_loss" | "maintenance" | "muscle_gain" | "recomposition"
  });

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);

  async function loadDay() {
    if (!user) return;
    const [dayLogs, dayWater] = await Promise.all([
      getTodayFoodLogs(user.id, selectedDate),
      getWaterLogs(user.id, selectedDate)
    ]);
    setLogs(dayLogs);
    setWaterLogs(dayWater);
  }

  async function loadWeek() {
    if (!user) return;
    setWeekData(await getNutritionWeek(user.id, weekStart));
  }

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    setLoadError("");
    Promise.all([
      loadDay(),
      getCalorieTargets(user.id),
      user.id === "mock-user" ? Promise.resolve([]) : getNutritionTargetProfiles(user.id).catch(() => []),
      getDefaultUserWorkoutPlan(user.id)
    ]).then(([, savedTargets, savedProfiles, plan]) => {
        setTargets(savedTargets);
        setTargetProfiles(savedProfiles);
        setTargetForm({
          dailyCalories: savedTargets?.daily_calories ? String(savedTargets.daily_calories) : "",
          proteinG: savedTargets?.protein_g ? String(savedTargets.protein_g) : "",
          carbsG: savedTargets?.carbs_g ? String(savedTargets.carbs_g) : "",
          fatG: savedTargets?.fat_g ? String(savedTargets.fat_g) : "",
          waterMl: savedTargets?.water_ml ? String(savedTargets.water_ml) : ""
        });
        const selectedWeekday = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
        const detectedType = plan?.days.some((day) => day.weekday === selectedWeekday && day.exercises.length > 0) ? "training_day" : "rest_day";
        const override = getActiveTargetOverride(user.id, selectedDate);
        setActiveTarget(resolveActiveNutritionTarget({
          profiles: savedProfiles,
          baseTarget: savedTargets,
          requestedType: override === "auto" ? detectedType : override
        }));
    }).catch((error) => {
      setLoadError(userSafeError(error, "Could not load the calorie tracker. Please refresh and try again."));
    }).finally(() => {
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, user?.id]);

  useEffect(() => {
    loadWeek().catch((error) =>
      toast({ title: "Could not load weekly tracker", description: userSafeError(error, "Please refresh and try again.") })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, user?.id]);

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const waterTotal = useMemo(() => waterLogs.reduce((sum, log) => sum + Number(log.amount_ml), 0), [waterLogs]);
  const hasTargets = Boolean(targets || activeTarget?.hasTarget);
  const emptyTargets = { daily_calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, water_ml: 0 };
  const baseTargets = targets ?? emptyTargets;
  const displayTargets = activeTarget?.values ?? baseTargets;

  async function copyYesterday() {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before copying meals." });
    try {
      const copied = await copyYesterdaysMeals(user.id, selectedDate);
      await loadDay();
      await loadWeek();
      const message = copied.length
        ? `${copied.length} food item${copied.length === 1 ? "" : "s"} added to ${formatDay(selectedDate)}.`
        : "There were no food items yesterday to copy.";
      setCopyStatus(message);
      toast({ title: copied.length ? "Yesterday copied" : "Nothing to copy", description: message });
    } catch (error) {
      const message = userSafeError(error);
      setCopyStatus(message);
      toast({ title: "Could not copy yesterday", description: message });
    }
  }

  async function saveTargets() {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before saving targets." });
    const dailyCalories = Number(targetForm.dailyCalories);
    const proteinG = Number(targetForm.proteinG);
    const carbsG = Number(targetForm.carbsG);
    const fatG = Number(targetForm.fatG);
    const waterMl = Number(targetForm.waterMl);

    if (Number.isNaN(dailyCalories) || dailyCalories < 500 || dailyCalories > 15000) {
      return toast({ title: "Check daily calories", description: "Enter a realistic daily target, e.g. 1800 or 2200 kcal." });
    }
    if (Number.isNaN(proteinG) || proteinG < 0 || proteinG > 1000 || Number.isNaN(carbsG) || carbsG < 0 || carbsG > 2000 || Number.isNaN(fatG) || fatG < 0 || fatG > 1000) {
      return toast({ title: "Check macros", description: "Enter realistic macro targets (0 or higher)." });
    }
    if (Number.isNaN(waterMl) || waterMl < 250 || waterMl > 20000) {
      return toast({ title: "Check water target", description: "Enter a realistic daily water target in milliliters." });
    }

    setIsSavingTargets(true);
    try {
      const saved = await upsertCalorieTargets({
        userId: user.id,
        dailyCalories,
        proteinG,
        carbsG,
        fatG,
        waterMl
      });
      const normalized = {
        daily_calories: Number(saved.daily_calories),
        protein_g: Number(saved.protein_g),
        carbs_g: Number(saved.carbs_g),
        fat_g: Number(saved.fat_g),
        water_ml: Number(saved.water_ml ?? waterMl)
      };
      setTargets(normalized);
      if (activeTarget) {
        setActiveTarget(resolveActiveNutritionTarget({ profiles: targetProfiles, baseTarget: normalized, requestedType: activeTarget.requestedType }));
      }
      setShowTargetEditor(false);
      await loadWeek();
      toast({ title: "Targets saved", description: `${normalized.daily_calories} kcal target is active.` });
    } catch (error) {
      toast({ title: "Could not save targets", description: userSafeError(error) });
    } finally {
      setIsSavingTargets(false);
    }
  }

  async function addWater(amountMl: number) {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before logging water." });
    if (!Number.isFinite(amountMl) || amountMl <= 0) {
      setWaterFeedbackVariant("error");
      setWaterFeedback("Enter a water amount greater than zero.");
      return;
    }
    if (waterPendingKey) return;

    const pendingKey = `add-${Math.round(amountMl)}`;
    const previousLogs = waterLogs;
    const now = new Date().toISOString();
    const optimisticLog: WaterLog = {
      id: `optimistic-water-${Date.now()}`,
      user_id: user.id,
      log_date: selectedDate,
      amount_ml: Math.round(amountMl),
      created_at: now,
      updated_at: now
    };

    setWaterPendingKey(pendingKey);
    setWaterFeedbackVariant("info");
    setWaterFeedback(`+${Math.round(amountMl)} ml pending...`);
    setWaterLogs((current) => [optimisticLog, ...current]);
    try {
      const log = await addWaterLog(user.id, selectedDate, amountMl);
      setWaterLogs((current) => current.map((item) => item.id === optimisticLog.id ? log : item));
      setWaterFeedback(`+${Math.round(amountMl)} ml added`);
      window.setTimeout(() => setWaterFeedback(""), 1500);
      await loadWeek();
    } catch (error) {
      setWaterLogs(previousLogs);
      setWaterFeedbackVariant("error");
      setWaterFeedback("Water was not saved. We restored your previous total.");
      toast({ title: "Could not add water", description: userSafeError(error) });
    } finally {
      setWaterPendingKey(null);
    }
  }

  async function removeWater(log: WaterLog) {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before deleting water logs." });
    if (waterDeletingIds.has(log.id)) return;

    const previousLogs = waterLogs;
    setWaterDeletingIds((current) => new Set(current).add(log.id));
    setWaterLogs((current) => current.filter((item) => item.id !== log.id));
    setWaterFeedbackVariant("info");
    setWaterFeedback("Removing water entry...");
    try {
      await deleteWaterLog(user.id, log.id);
      setWaterFeedback("Water entry removed.");
      window.setTimeout(() => setWaterFeedback(""), 1500);
      await loadWeek();
    } catch (error) {
      setWaterLogs(previousLogs);
      setWaterFeedbackVariant("error");
      setWaterFeedback("Entry was not removed. We restored it.");
      toast({ title: "Could not delete water log", description: userSafeError(error) });
    } finally {
      setWaterDeletingIds((current) => {
        const next = new Set(current);
        next.delete(log.id);
        return next;
      });
    }
  }

  function moveWeek(days: number) {
    setSelectedDate(addDays(selectedDate, days));
  }

  function handleLogAdded(log: FoodLog) {
    if (log.log_date === selectedDate) setLogs((current) => [log, ...current]);
    loadWeek().catch(() => undefined);
    loadDay().catch(() => undefined);
  }

  function calculateTargetsFromWizard() {
    const age = Number(wizard.age);
    const heightCm = Number(wizard.heightCm);
    const weightKg = Number(wizard.weightKg);
    if (!age || !heightCm || !weightKg) {
      toast({ title: "Complete target setup", description: "Enter age, height, and weight before estimating targets." });
      return;
    }
    const estimate = estimateTdee({ ...wizard, age, heightCm, weightKg });
    setTargetForm({
      dailyCalories: String(estimate.daily_calories),
      proteinG: String(estimate.protein_g),
      carbsG: String(estimate.carbs_g),
      fatG: String(estimate.fat_g),
      waterMl: String(estimate.water_ml)
    });
    toast({ title: "Targets estimated", description: `Estimated maintenance is ${estimate.maintenance_calories} kcal. Review and save to use these targets.` });
  }

  if (isLoading) {
    return <CardGridSkeleton count={2} rows={3} />;
  }

  if (loadError) {
    return (
      <ErrorState
        className="m-4"
        title="Failed to load calories"
        description={loadError}
        onRetry={() => router.refresh()}
      />
    );
  }

  return (
    <>
      <PageHeading
        title="Nutrition Tracker"
        description={`Review ChatGPT meal estimates, track food and water, and keep manual controls available for corrections on ${formatDay(selectedDate)}.`}
        action={
          <div className="hidden sm:flex flex-wrap gap-2">
            <Button asChild variant="outline" className="min-h-12">
              <Link href="/calories/weekly-overview">
                <BarChart3 className="h-4 w-4" />
                Weekly Summary
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-12">
              <Link href="/calories/custom-food-meal">
                <ChefHat className="h-4 w-4" />
                Food Builder
              </Link>
            </Button>
            <Button variant="outline" className="min-h-12" onClick={copyYesterday}>
              <Copy className="h-4 w-4" />
              Copy previous day
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="glass-card-strong h-12 w-full rounded-[14px] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Select tab"
          >
            <option value="today">Today — Food log & summary</option>
            <option value="week">Week — Weekly overview</option>
            <option value="targets">Targets — Goals & setup</option>
            <option value="tools">Tools — Browse, scan, recipes</option>
          </select>
        </div>

        <TabsList className="glass-shell hidden w-full justify-start overflow-x-auto rounded-2xl border-0 p-1 sm:inline-flex sm:w-auto">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <Card className="border-primary/25 bg-primary/5 transition-all duration-300">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Active today</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{activeTarget?.label ?? "Target not set"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{activeTarget?.reason ?? "Add a base or day-type target to see today’s goal."}</p>
                </div>
                <Button type="button" variant="outline" className="min-h-12" onClick={() => setActiveTab("targets")}>Review targets</Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <SavedTarget label="Calories" value={displayTargets.daily_calories ? `${displayTargets.daily_calories} kcal` : "-"} />
                <SavedTarget label="Protein" value={displayTargets.protein_g ? `${displayTargets.protein_g}g` : "-"} />
                <SavedTarget label="Carbs" value={displayTargets.carbs_g ? `${displayTargets.carbs_g}g` : "-"} />
                <SavedTarget label="Fat" value={displayTargets.fat_g ? `${displayTargets.fat_g}g` : "-"} />
                <SavedTarget label="Water" value={displayTargets.water_ml ? `${displayTargets.water_ml} ml / ${(displayTargets.water_ml / 1000).toFixed(2)} L` : "-"} />
              </div>
            </CardContent>
          </Card>
          {/* Mobile today view */}
          <div className="space-y-4 sm:hidden">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{formatDay(selectedDate)}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="min-h-12" onClick={() => moveWeek(-1)}>Prev</Button>
                <Button variant="outline" className="min-h-12" onClick={() => moveWeek(1)}>Next</Button>
              </div>
            </div>

            <CompactNutritionSummary totals={totals} targets={displayTargets} waterTotal={waterTotal} />

            <ChatGptMealImportReview selectedDate={selectedDate} onSaved={handleLogAdded} />

            <RecentFoodStrip logDate={selectedDate} onFoodLogged={handleLogAdded} />

            <FoodLogList
              logs={logs}
              title={`${formatDay(selectedDate)} food log`}
              onDeleted={(id) => {
                setLogs((current) => current.filter((log) => log.id !== id));
                loadWeek().catch(() => undefined);
                loadDay().catch(() => undefined);
              }}
              onAddAction={() => router.push("/calories/food-hub")}
              onCustomFoodAction={() => router.push("/calories/custom-food-meal")}
              onScanAction={() => setActiveTab("tools")}
              onCopyPrevious={copyYesterday}
              copyStatus={copyStatus}
            />

            <WaterMiniSummary
              waterTotal={waterTotal}
              waterGoal={displayTargets.water_ml}
              onAddWater={addWater}
              waterFeedback={waterFeedback}
              waterFeedbackVariant={waterFeedbackVariant}
              pendingWaterKey={waterPendingKey}
            />

            <details className="glass-card-strong">
              <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-semibold">
                <span>More tools</span>
                <span className="text-xs text-muted-foreground">Tap to expand</span>
              </summary>
              <div className="space-y-4 p-4 pt-0">
                <div className="grid gap-3">
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/calories/weekly-overview">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Weekly Summary
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/calories/custom-food-meal">
                      <ChefHat className="mr-2 h-4 w-4" />
                      Food Builder
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full" onClick={copyYesterday}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy previous day
                  </Button>
                </div>
              </div>
            </details>
          </div>

          {/* Desktop today view */}
          <div className="hidden sm:block space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <TrackerCard label="Calories" value={totals.calories} target={displayTargets.daily_calories} unit="kcal" hasTarget={displayTargets.daily_calories > 0} />
              <TrackerCard label="Protein" value={totals.protein_g} target={displayTargets.protein_g} unit="g" hasTarget={displayTargets.protein_g > 0} />
              <TrackerCard label="Carbs" value={totals.carbs_g} target={displayTargets.carbs_g} unit="g" hasTarget={displayTargets.carbs_g > 0} />
              <TrackerCard label="Fat" value={totals.fat_g} target={displayTargets.fat_g} unit="g" hasTarget={displayTargets.fat_g > 0} />
              <TrackerCard label="Water" value={waterTotal} target={displayTargets.water_ml} unit=" ml" hasTarget={displayTargets.water_ml > 0} />
            </div>

            <ChatGptMealImportReview selectedDate={selectedDate} onSaved={handleLogAdded} />

            <RecentFoodStrip logDate={selectedDate} onFoodLogged={handleLogAdded} />

            <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-4">
                <WaterCard
                  waterTotal={waterTotal}
                  waterGoal={displayTargets.water_ml}
                  customWaterMl={customWaterMl}
                  setCustomWaterMl={setCustomWaterMl}
                  waterLogs={waterLogs}
                  onAddWater={addWater}
                  onRemoveWater={removeWater}
                  waterFeedback={waterFeedback}
                  waterFeedbackVariant={waterFeedbackVariant}
                  pendingWaterKey={waterPendingKey}
                  deletingWaterIds={waterDeletingIds}
                />
              </div>
              <FoodLogList
                logs={logs}
                title={`${formatDay(selectedDate)} food log`}
                onDeleted={(id) => {
                  setLogs((current) => current.filter((log) => log.id !== id));
                  loadWeek().catch(() => undefined);
                }}
                onAddAction={() => router.push("/calories/food-hub")}
                onCustomFoodAction={() => router.push("/calories/custom-food-meal")}
                onScanAction={() => setActiveTab("tools")}
                onCopyPrevious={copyYesterday}
                copyStatus={copyStatus}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="week" className="space-y-4">
          <WeeklyTracker
            selectedDate={selectedDate}
            weekData={weekData}
            onSelectDate={setSelectedDate}
            onMoveWeek={moveWeek}
          />
          <NutritionCoachCard
            weekData={weekData}
            targets={displayTargets}
            totals={totals}
            waterTotal={waterTotal}
          />
          <WeeklyOverview weekData={weekData} waterGoalMl={displayTargets.water_ml} />
        </TabsContent>

        <TabsContent value="targets" className="space-y-4">
          <NutritionTargetProfiles onActiveTargetChange={setActiveTarget} baseTarget={targets} />
          <Card id="daily-targets" className="scroll-mt-24">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Base target</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasTargets ? "This is your fallback when a day-type target is not saved." : "Set a base target to unlock remaining macros and weekly adherence."}
                </p>
              </div>
              <Button variant={showTargetEditor || !hasTargets ? "default" : "outline"} onClick={() => setShowTargetEditor((current) => !current)}>
                <Settings2 className="h-4 w-4" />
                {showTargetEditor || !hasTargets ? "Hide setup" : "Edit base target"}
              </Button>
            </CardHeader>
            <CardContent>
              {showTargetEditor || !hasTargets ? (
                <div className="grid gap-3 md:grid-cols-6">
                  <div className="solid-row p-3 md:col-span-6">
                    <p className="font-semibold">Goal-based target setup</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-6">
                      <TargetField label="Age" value={wizard.age} onChange={(age) => setWizard((current) => ({ ...current, age }))} />
                      <TargetField label="Height cm" value={wizard.heightCm} onChange={(heightCm) => setWizard((current) => ({ ...current, heightCm }))} />
                      <TargetField label="Weight kg" value={wizard.weightKg} onChange={(weightKg) => setWizard((current) => ({ ...current, weightKg }))} />
                      <SelectField label="Sex" value={wizard.sex} values={["male", "female"]} onChange={(sex) => setWizard((current) => ({ ...current, sex: sex as "male" | "female" }))} />
                      <SelectField label="Activity" value={wizard.activityLevel} values={["sedentary", "light", "moderate", "very_active"]} onChange={(activityLevel) => setWizard((current) => ({ ...current, activityLevel: activityLevel as typeof current.activityLevel }))} />
                      <SelectField label="Goal" value={wizard.goal} values={["fat_loss", "maintenance", "muscle_gain", "recomposition"]} onChange={(goal) => setWizard((current) => ({ ...current, goal: goal as typeof current.goal }))} />
                      <Button className="md:col-span-6" type="button" variant="outline" onClick={calculateTargetsFromWizard}>
                        Estimate targets
                      </Button>
                    </div>
                  </div>
                  <TargetField label="Calories" value={targetForm.dailyCalories} onChange={(dailyCalories) => setTargetForm((current) => ({ ...current, dailyCalories }))} />
                  <TargetField label="Protein g" value={targetForm.proteinG} onChange={(proteinG) => setTargetForm((current) => ({ ...current, proteinG }))} />
                  <TargetField label="Carbs g" value={targetForm.carbsG} onChange={(carbsG) => setTargetForm((current) => ({ ...current, carbsG }))} />
                  <TargetField label="Fat g" value={targetForm.fatG} onChange={(fatG) => setTargetForm((current) => ({ ...current, fatG }))} />
                  <TargetField label="Water ml" value={targetForm.waterMl} onChange={(waterMl) => setTargetForm((current) => ({ ...current, waterMl }))} />
                  <Button className="self-end" onClick={saveTargets} disabled={isSavingTargets}>
                    <Save className="h-4 w-4" />
                    {isSavingTargets ? "Saving..." : "Save target"}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 text-sm md:grid-cols-5">
                  <SavedTarget label="Calories" value={`${displayTargets.daily_calories} kcal`} />
                  <SavedTarget label="Protein" value={`${displayTargets.protein_g}g`} />
                  <SavedTarget label="Carbs" value={`${displayTargets.carbs_g}g`} />
                  <SavedTarget label="Fat" value={`${displayTargets.fat_g}g`} />
                  <SavedTarget label="Water" value={`${displayTargets.water_ml} ml`} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <div id="barcode-tools" className="scroll-mt-24">
            <ApiFoodTools selectedDate={selectedDate} onFoodLogged={handleLogAdded} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
