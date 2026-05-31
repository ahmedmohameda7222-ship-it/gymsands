"use client";

import { Copy, Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { FoodLogList } from "@/components/meals/food-log-list";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { copyYesterdaysMeals, getCalorieTargets, getTodayFoodLogs, upsertCalorieTargets } from "@/services/database/repository";
import { percent, remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import type { FoodLog } from "@/types";

type Targets = {
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
};

const fallbackTargets: Targets = {
  daily_calories: 2200,
  protein_g: 150,
  carbs_g: 250,
  fat_g: 70,
  water_ml: 2500
};

function mixColor(start: [number, number, number], end: [number, number, number], amount: number) {
  const clamped = Math.min(1, Math.max(0, amount));
  const [r, g, b] = start.map((value, index) => Math.round(value + (end[index] - value) * clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

function calorieProgressColor(progressPercent: number) {
  if (progressPercent <= 50) return "rgb(37, 99, 235)";
  if (progressPercent <= 80) return mixColor([37, 99, 235], [245, 158, 11], (progressPercent - 50) / 30);
  if (progressPercent <= 95) return mixColor([245, 158, 11], [239, 68, 68], (progressPercent - 80) / 15);
  return "rgb(220, 38, 38)";
}

export default function CaloriesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [targets, setTargets] = useState<Targets>(fallbackTargets);
  const [targetForm, setTargetForm] = useState({ dailyCalories: "2200", proteinG: "150", carbsG: "250", fatG: "70" });
  const [isSavingTargets, setIsSavingTargets] = useState(false);

  useEffect(() => {
    if (!user) return;
    getTodayFoodLogs(user.id)
      .then(setLogs)
      .catch((error) =>
        toast({
          title: "Could not load calorie tracker",
          description: error instanceof Error ? error.message : "Please refresh and try again."
        })
      );

    getCalorieTargets(user.id).then((savedTargets) => {
      const normalized = {
        daily_calories: Number(savedTargets.daily_calories),
        protein_g: Number(savedTargets.protein_g),
        carbs_g: Number(savedTargets.carbs_g),
        fat_g: Number(savedTargets.fat_g),
        water_ml: Number(savedTargets.water_ml ?? 2500)
      };
      setTargets(normalized);
      setTargetForm({
        dailyCalories: String(normalized.daily_calories),
        proteinG: String(normalized.protein_g),
        carbsG: String(normalized.carbs_g),
        fatG: String(normalized.fat_g)
      });
    });
  }, [toast, user]);

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const trackerTargets = {
    calories: targets.daily_calories,
    protein_g: targets.protein_g,
    carbs_g: targets.carbs_g,
    fat_g: targets.fat_g,
    water_ml: targets.water_ml
  };
  const remaining = remainingMacros(trackerTargets, totals);

  async function copyYesterday() {
    try {
      const copied = await copyYesterdaysMeals(user?.id ?? "mock-user");
      setLogs((current) => [...copied, ...current]);
      toast({ title: "Yesterday copied", description: `${copied.length} food items added to today.` });
    } catch (error) {
      toast({
        title: "Could not copy yesterday",
        description: error instanceof Error ? error.message : "Please try again."
      });
    }
  }

  async function saveTargets() {
    const dailyCalories = Number(targetForm.dailyCalories);
    const proteinG = Number(targetForm.proteinG);
    const carbsG = Number(targetForm.carbsG);
    const fatG = Number(targetForm.fatG);

    if (!dailyCalories || dailyCalories < 500) {
      return toast({ title: "Check daily calories", description: "Enter a realistic daily target, e.g. 1800 or 2200 kcal." });
    }

    setIsSavingTargets(true);
    try {
      const saved = await upsertCalorieTargets({
        userId: user?.id ?? "mock-user",
        dailyCalories,
        proteinG,
        carbsG,
        fatG,
        waterMl: targets.water_ml
      });
      const normalized = {
        daily_calories: Number(saved.daily_calories),
        protein_g: Number(saved.protein_g),
        carbs_g: Number(saved.carbs_g),
        fat_g: Number(saved.fat_g),
        water_ml: Number(saved.water_ml ?? targets.water_ml)
      };
      setTargets(normalized);
      toast({ title: "Targets saved", description: `${normalized.daily_calories} kcal target is active for today.` });
    } catch (error) {
      toast({ title: "Could not save targets", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSavingTargets(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Calorie Tracker"
        description="Track calories, protein, carbs, fat, serving quantities, and your personal daily target."
        action={
          <Button variant="outline" onClick={copyYesterday}>
            <Copy className="h-4 w-4" />
            Copy yesterday
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-4">
        <TrackerCard label="Calories" value={totals.calories} target={targets.daily_calories} unit="kcal" />
        <TrackerCard label="Protein" value={totals.protein_g} target={targets.protein_g} unit="g" />
        <TrackerCard label="Carbs" value={totals.carbs_g} target={targets.carbs_g} unit="g" />
        <TrackerCard label="Fat" value={totals.fat_g} target={targets.fat_g} unit="g" />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Daily target</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <TargetField label="Calories" value={targetForm.dailyCalories} onChange={(dailyCalories) => setTargetForm((current) => ({ ...current, dailyCalories }))} />
          <TargetField label="Protein g" value={targetForm.proteinG} onChange={(proteinG) => setTargetForm((current) => ({ ...current, proteinG }))} />
          <TargetField label="Carbs g" value={targetForm.carbsG} onChange={(carbsG) => setTargetForm((current) => ({ ...current, carbsG }))} />
          <TargetField label="Fat g" value={targetForm.fatG} onChange={(fatG) => setTargetForm((current) => ({ ...current, fatG }))} />
          <Button className="self-end" onClick={saveTargets} disabled={isSavingTargets}>
            <Save className="h-4 w-4" />
            {isSavingTargets ? "Saving..." : "Save target"}
          </Button>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <Card className="bg-navy-950 text-white">
            <CardHeader>
              <CardTitle>Remaining today</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{remaining.calories} kcal</p>
              <p className="mt-2 text-sm text-blue-100">
                {remaining.protein_g}g protein | {remaining.carbs_g}g carbs | {remaining.fat_g}g fat
              </p>
            </CardContent>
          </Card>
          <FoodLogList logs={logs} onDeleted={(id) => setLogs((current) => current.filter((log) => log.id !== id))} />
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Plus className="h-4 w-4" />
            Add food from Egyptian database
          </div>
          <FoodBrowser initialLogs={logs} onLogAdded={(log) => setLogs((current) => [log, ...current])} />
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

function TrackerCard({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const progressValue = percent(value, target);
  const isCalories = label.toLowerCase() === "calories";
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}{unit}</p>
        <p className="mt-1 text-sm text-muted-foreground">Target {target}{unit}</p>
        <Progress
          value={progressValue}
          className="mt-4"
          indicatorStyle={isCalories ? { background: calorieProgressColor(progressValue) } : undefined}
        />
      </CardContent>
    </Card>
  );
}
