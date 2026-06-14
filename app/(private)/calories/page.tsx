"use client";

import Link from "next/link";
import { BarChart3, ChefHat, ChevronLeft, ChevronRight, Copy, Droplets, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { FoodLogList } from "@/components/meals/food-log-list";
import { ApiFoodTools } from "@/components/meals/api-food-tools";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import {
  addWaterLog,
  copyYesterdaysMeals,
  deleteWaterLog,
  getCalorieTargets,
  getNutritionWeek,
  getTodayFoodLogs,
  getWaterLogs,
  upsertCalorieTargets
} from "@/services/database/repository";
import { percent, sumFoodLogs } from "@/services/nutrition/calculations";
import { estimateTdee, type SavedTargets } from "@/services/nutrition/targets";
import { todayIso } from "@/lib/utils";
import type { DailyNutritionSummary, FoodLog, WaterLog } from "@/types";

function mixColor(start: [number, number, number], end: [number, number, number], amount: number) {
  const clamped = Math.min(1, Math.max(0, amount));
  const [r, g, b] = start.map((value, index) => Math.round(value + (end[index] - value) * clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

function calorieProgressColor(progressPercent: number) {
  if (progressPercent <= 50) return "rgb(85, 96, 61)";
  if (progressPercent <= 80) return mixColor([85, 96, 61], [212, 176, 106], (progressPercent - 50) / 30);
  if (progressPercent <= 95) return mixColor([212, 176, 106], [184, 138, 74], (progressPercent - 80) / 15);
  return "rgb(143, 59, 52)";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return toDateOnly(date);
}

function formatDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function CaloriesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [weekData, setWeekData] = useState<DailyNutritionSummary[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [targets, setTargets] = useState<SavedTargets | null>(null);
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
    loadDay().catch((error) =>
      toast({ title: "Could not load calorie tracker", description: error instanceof Error ? error.message : "Please refresh and try again." })
    );
    getCalorieTargets(user.id).then((savedTargets) => {
      setTargets(savedTargets);
      setTargetForm({
        dailyCalories: savedTargets?.daily_calories ? String(savedTargets.daily_calories) : "",
        proteinG: savedTargets?.protein_g ? String(savedTargets.protein_g) : "",
        carbsG: savedTargets?.carbs_g ? String(savedTargets.carbs_g) : "",
        fatG: savedTargets?.fat_g ? String(savedTargets.fat_g) : "",
        waterMl: savedTargets?.water_ml ? String(savedTargets.water_ml) : ""
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, toast, user?.id]);

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
      const copied = await copyYesterdaysMeals(user.id);
      if (selectedDate === todayIso()) setLogs((current) => [...copied, ...current]);
      await loadWeek();
      toast({ title: "Yesterday copied", description: `${copied.length} food items added to today.` });
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

    if (!dailyCalories || dailyCalories < 500) {
      return toast({ title: "Check daily calories", description: "Enter a realistic daily target, e.g. 1800 or 2200 kcal." });
    }
    if (!waterMl || waterMl < 250) {
      return toast({ title: "Check water target", description: "Enter a daily water target in milliliters." });
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
    setSelectedDate(toDateOnly(addDays(new Date(`${selectedDate}T00:00:00`), days)));
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

  return (
    <>
      <PageHeading
        title="Calorie Tracker"
        description="Track daily food, macros, and water intake."
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
              Copy yesterday
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

      <Card className="mt-4">
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

      <div className="mt-4">
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

function TargetField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TrackerCard({ label, value, target, unit, hasTarget }: { label: string; value: number; target: number; unit: string; hasTarget: boolean }) {
  const progressValue = percent(value, target);
  const isCalories = label.toLowerCase() === "calories";
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}{unit}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hasTarget ? `Target ${target}${unit}` : "No target set"}</p>
        <Progress
          value={hasTarget ? progressValue : 0}
          className="mt-4"
          indicatorStyle={isCalories ? { background: calorieProgressColor(progressValue) } : undefined}
        />
      </CardContent>
    </Card>
  );
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {values.map((item) => (
          <option key={item} value={item}>{item.replace("_", " ")}</option>
        ))}
      </select>
    </div>
  );
}

function SavedTarget({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function WeeklyTracker({
  selectedDate,
  weekData,
  onSelectDate,
  onMoveWeek
}: {
  selectedDate: string;
  weekData: DailyNutritionSummary[];
  onSelectDate: (date: string) => void;
  onMoveWeek: (days: number) => void;
}) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>Weekly tracker</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onMoveWeek(-7)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
          <Button variant="outline" size="sm" onClick={() => onMoveWeek(7)}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {weekData.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date)}
              className={`rounded-md border p-3 text-left transition hover:border-primary hover:bg-blue-50 ${day.date === selectedDate ? "border-primary bg-blue-50" : "bg-white"}`}
            >
              <p className="font-semibold">{formatDay(day.date)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {day.has_targets ? `${day.calories} / ${day.planned_calories} kcal` : `${day.calories} kcal logged`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">P {day.protein_g}g | C {day.carbs_g}g | F {day.fat_g}g</p>
              <p className="mt-1 text-xs text-muted-foreground">Water {day.water_ml} ml</p>
              <Progress value={day.has_targets ? percent(day.calories, day.planned_calories) : 0} className="mt-3" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyOverview({ weekData, waterGoalMl }: { weekData: DailyNutritionSummary[]; waterGoalMl: number }) {
  const planned = weekData.reduce((sum, day) => sum + day.planned_calories, 0);
  const actual = weekData.reduce((sum, day) => sum + day.calories, 0);
  const protein = weekData.reduce((sum, day) => sum + day.protein_g, 0);
  const carbs = weekData.reduce((sum, day) => sum + day.carbs_g, 0);
  const fat = weekData.reduce((sum, day) => sum + day.fat_g, 0);
  const water = weekData.reduce((sum, day) => sum + day.water_ml, 0);
  const difference = actual - planned;
  const deviation = planned ? (difference / planned) * 100 : 0;
  const loggedDays = weekData.filter((day) => day.logs.length > 0);
  const best = loggedDays.slice().sort((a, b) => Math.abs(a.calories - a.planned_calories) - Math.abs(b.calories - b.planned_calories))[0];
  const worst = loggedDays.slice().sort((a, b) => Math.abs(b.calories - b.planned_calories) - Math.abs(a.calories - a.planned_calories))[0];
  const status =
    Math.abs(deviation) <= 5
      ? "On track"
      : deviation < -15
        ? "Large deficit"
        : deviation < -5
          ? "Slight deficit"
          : deviation > 15
            ? "Large surplus"
            : "Slight surplus";
  const maxCalories = Math.max(1, ...weekData.map((day) => Math.max(day.planned_calories, day.calories)));

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Weekly Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric label="Planned calories" value={planned} />
          <OverviewMetric label="Actual calories" value={actual} />
          <OverviewMetric label="Difference" value={`${difference > 0 ? "+" : ""}${difference} kcal`} />
          <OverviewMetric label="Deviation" value={`${Math.round(deviation * 10) / 10}%`} detail={status} />
          <OverviewMetric label="Average calories" value={Math.round(actual / 7)} />
          <OverviewMetric label="Average protein" value={`${Math.round(protein / 7)}g`} />
          <OverviewMetric label="Average carbs" value={`${Math.round(carbs / 7)}g`} />
          <OverviewMetric label="Average fat" value={`${Math.round(fat / 7)}g`} />
          <OverviewMetric label="Best tracking day" value={best ? formatDay(best.date) : "None"} />
          <OverviewMetric label="Worst deviation day" value={worst ? formatDay(worst.date) : "None"} />
          <OverviewMetric label="Days logged" value={`${loggedDays.length}/7`} />
          <OverviewMetric label="Water" value={`${Math.round(water / 100) / 10} L`} detail={`${Math.round(water / 7)} ml avg`} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">Weekly progress</span>
            <span className="text-muted-foreground">{actual} / {planned} kcal</span>
          </div>
          <Progress value={percent(actual, planned)} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-md border p-3">
            <p className="text-sm font-semibold">Daily comparison</p>
            <div className="mt-3 space-y-2">
              {weekData.map((day) => (
                <div key={day.date} className="grid grid-cols-[76px_1fr] items-center gap-3 text-xs">
                  <span>{formatDay(day.date).split(",")[0]}</span>
                  <div className="space-y-1">
                    <div className="h-2 rounded bg-primary">
                      <div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, (day.planned_calories / maxCalories) * 100)}%` }} />
                    </div>
                    <div className="h-2 rounded bg-emerald-100">
                      <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, (day.calories / maxCalories) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm font-semibold">Macro distribution</p>
            <div className="mt-3 space-y-3">
              <MacroBar label="Protein" value={protein} total={protein + carbs + fat} />
              <MacroBar label="Carbs" value={carbs} total={protein + carbs + fat} />
              <MacroBar label="Fat" value={fat} total={protein + carbs + fat} />
              <div className="pt-2">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1"><Droplets className="h-4 w-4" /> Water</span>
                  <span>{Math.round(water / 100) / 10} L</span>
                </div>
                <Progress value={percent(water, waterGoalMl * 7)} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function MacroBar({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span>{Math.round(value)}g</span>
      </div>
      <Progress value={percent(value, total)} />
    </div>
  );
}

function WaterCard({
  waterTotal,
  waterGoal,
  customWaterMl,
  setCustomWaterMl,
  waterLogs,
  onAddWater,
  onRemoveWater
}: {
  waterTotal: number;
  waterGoal: number;
  customWaterMl: string;
  setCustomWaterMl: (value: string) => void;
  waterLogs: WaterLog[];
  onAddWater: (amount: number) => void;
  onRemoveWater: (log: WaterLog) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Water intake</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-bold">{waterTotal} ml</p>
          <p className="text-sm text-muted-foreground">Goal {waterGoal} ml</p>
          <Progress value={percent(waterTotal, waterGoal)} className="mt-3" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[250, 500, 750, 1000].map((amount) => (
            <Button key={amount} type="button" variant="outline" size="sm" onClick={() => onAddWater(amount)}>
              +{amount === 1000 ? "1 L" : `${amount} ml`}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input type="number" min="1" value={customWaterMl} onChange={(event) => setCustomWaterMl(event.target.value)} />
          <Button type="button" onClick={() => onAddWater(Number(customWaterMl))}>Add water</Button>
        </div>
        <div className="space-y-2">
          {waterLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>{log.amount_ml} ml</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveWater(log)} aria-label="Delete water log">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
