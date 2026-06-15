"use client";

import { BarChart3, ChefHat, Copy, Plus, Save, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { FoodLogList } from "@/components/meals/food-log-list";
import { ApiFoodTools } from "@/components/meals/api-food-tools";
import {
  FastFoodFlowCard,
  NutritionCoachCard,
  SavedTarget,
  SelectField,
  TargetField,
  TrackerCard,
  WaterCard,
  WeeklyOverview,
  WeeklyTracker,
  formatDay
} from "@/components/meals/calories-page-sections";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import Link from "next/link";
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

export default function CaloriesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [weekData, setWeekData] = useState<DailyNutritionSummary[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [targets, setTargets] = useState<SavedTargets | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [targetForm, setTargetForm] = useState({ dailyCalories: "", proteinG: "", carbsG: "", fatG: "", waterMl: "" });
  const [customWaterMl, setCustomWaterMl] = useState("250");
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);
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
      getCalorieTargets(user.id).then((savedTargets) => {
        setTargets(savedTargets);
        setTargetForm({
          dailyCalories: savedTargets?.daily_calories ? String(savedTargets.daily_calories) : "",
          proteinG: savedTargets?.protein_g ? String(savedTargets.protein_g) : "",
          carbsG: savedTargets?.carbs_g ? String(savedTargets.carbs_g) : "",
          fatG: savedTargets?.fat_g ? String(savedTargets.fat_g) : "",
          waterMl: savedTargets?.water_ml ? String(savedTargets.water_ml) : ""
        });
      })
    ]).catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Could not load calorie tracker.");
    }).finally(() => {
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, user?.id]);

  useEffect(() => {
    loadWeek().catch((error) =>
      toast({ title: "Could not load weekly tracker", description: error instanceof Error ? error.message : "Please try again." })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, user?.id]);

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const waterTotal = useMemo(() => waterLogs.reduce((sum, log) => sum + Number(log.amount_ml), 0), [waterLogs]);
  const hasTargets = Boolean(targets);
  const emptyTargets = { daily_calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, water_ml: 0 };
  const displayTargets = targets ?? emptyTargets;

  async function copyYesterday() {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before copying meals." });
    try {
      const copied = await copyYesterdaysMeals(user.id, selectedDate);
      await loadDay();
      await loadWeek();
      toast({ title: "Yesterday copied", description: `${copied.length} food items added to ${formatDay(selectedDate)}.` });
    } catch (error) {
      toast({ title: "Could not copy yesterday", description: error instanceof Error ? error.message : "Please try again." });
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
      setShowTargetEditor(false);
      await loadWeek();
      toast({ title: "Targets saved", description: `${normalized.daily_calories} kcal target is active.` });
    } catch (error) {
      toast({ title: "Could not save targets", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSavingTargets(false);
    }
  }

  async function addWater(amountMl: number) {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before logging water." });
    try {
      const log = await addWaterLog(user.id, selectedDate, amountMl);
      setWaterLogs((current) => [log, ...current]);
      await loadWeek();
    } catch (error) {
      toast({ title: "Could not add water", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function removeWater(log: WaterLog) {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before deleting water logs." });
    try {
      await deleteWaterLog(user.id, log.id);
      setWaterLogs((current) => current.filter((item) => item.id !== log.id));
      await loadWeek();
    } catch (error) {
      toast({ title: "Could not delete water log", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  function moveWeek(days: number) {
    setSelectedDate(addDays(selectedDate, days));
  }

  function handleLogAdded(log: FoodLog) {
    if (log.log_date === selectedDate) setLogs((current) => [log, ...current]);
    loadWeek().catch(() => undefined);
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
    return <div className="flex h-32 items-center justify-center"><p className="text-muted-foreground animate-pulse">Loading daily trackers...</p></div>;
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center text-destructive m-4">
        <p className="font-semibold">Failed to load calories</p>
        <p className="text-sm mt-1">{loadError}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <>
      <PageHeading
        title="Calorie Tracker"
        description={`Track daily food, macros, and water intake for ${formatDay(selectedDate)}.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/calories/weekly-overview">
                <BarChart3 className="h-4 w-4" />
                Weekly Summary
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/calories/custom-food-meal">
                <ChefHat className="h-4 w-4" />
                Food Builder
              </Link>
            </Button>
            <Button variant="outline" onClick={copyYesterday}>
              <Copy className="h-4 w-4" />
              Copy previous day
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <TrackerCard label="Calories" value={totals.calories} target={displayTargets.daily_calories} unit="kcal" hasTarget={Boolean(targets?.daily_calories)} />
        <TrackerCard label="Protein" value={totals.protein_g} target={displayTargets.protein_g} unit="g" hasTarget={Boolean(targets?.protein_g)} />
        <TrackerCard label="Carbs" value={totals.carbs_g} target={displayTargets.carbs_g} unit="g" hasTarget={Boolean(targets?.carbs_g)} />
        <TrackerCard label="Fat" value={totals.fat_g} target={displayTargets.fat_g} unit="g" hasTarget={Boolean(targets?.fat_g)} />
        <TrackerCard label="Water" value={Math.round(waterTotal / 1000 * 10) / 10} target={Math.round(displayTargets.water_ml / 1000 * 10) / 10} unit="L" hasTarget={Boolean(targets?.water_ml)} />
      </div>

      <Card id="daily-targets" className="mt-4 scroll-mt-24">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Daily target</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasTargets ? "Targets are saved for calorie, macro, and water reporting." : "No targets saved yet. Set targets to unlock remaining macros and weekly adherence."}
            </p>
          </div>
          <Button variant={showTargetEditor || !hasTargets ? "default" : "outline"} onClick={() => setShowTargetEditor((current) => !current)}>
            <Settings2 className="h-4 w-4" />
            {showTargetEditor || !hasTargets ? "Hide target setup" : "Edit targets"}
          </Button>
        </CardHeader>
        <CardContent>
          {showTargetEditor || !hasTargets ? (
            <div className="grid gap-3 md:grid-cols-6">
              <div className="rounded-md border bg-muted/40 p-3 md:col-span-6">
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

      <WeeklyTracker
        selectedDate={selectedDate}
        weekData={weekData}
        onSelectDate={setSelectedDate}
        onMoveWeek={moveWeek}
      />

      <FastFoodFlowCard
        selectedDateLabel={formatDay(selectedDate)}
        hasFoodLogs={logs.length > 0}
        hasTargets={hasTargets}
        onCopyYesterday={copyYesterday}
      />

      <NutritionCoachCard
        weekData={weekData}
        targets={displayTargets}
        totals={totals}
        waterTotal={waterTotal}
      />

      <WeeklyOverview weekData={weekData} waterGoalMl={displayTargets.water_ml} />

      <div id="barcode-tools" className="mt-4 scroll-mt-24">
        <ApiFoodTools selectedDate={selectedDate} onFoodLogged={handleLogAdded} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <WaterCard
            waterTotal={waterTotal}
            waterGoal={displayTargets.water_ml}
            customWaterMl={customWaterMl}
            setCustomWaterMl={setCustomWaterMl}
            waterLogs={waterLogs}
            onAddWater={addWater}
            onRemoveWater={removeWater}
          />
          <FoodLogList
            logs={logs}
            title={`${formatDay(selectedDate)} food log`}
            onDeleted={(id) => {
              setLogs((current) => current.filter((log) => log.id !== id));
              loadWeek().catch(() => undefined);
            }}
          />
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Plus className="h-4 w-4" />
            Add food to {formatDay(selectedDate)}
          </div>
          <FoodBrowser initialLogs={logs} logDate={selectedDate} onLogAdded={handleLogAdded} />
        </div>
      </div>
    </>
  );
}

