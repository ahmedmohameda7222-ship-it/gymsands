"use client";

import { Copy, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { FoodLogList } from "@/components/meals/food-log-list";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { copyYesterdaysMeals, getTodayFoodLogs } from "@/services/database/repository";
import { defaultTargets, percent, remainingMacros, sumFoodLogs } from "@/services/nutrition/calculations";
import type { FoodLog } from "@/types";

export default function CaloriesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<FoodLog[]>([]);

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
  }, [toast, user]);

  const totals = useMemo(() => sumFoodLogs(logs), [logs]);
  const remaining = remainingMacros(defaultTargets, totals);

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

  return (
    <>
      <PageHeading
        title="Calorie Tracker"
        description="Track calories, protein, carbs, fat, and serving quantities."
        action={
          <Button variant="outline" onClick={copyYesterday}>
            <Copy className="h-4 w-4" />
            Copy yesterday
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-4">
        <TrackerCard label="Calories" value={totals.calories} target={defaultTargets.calories} unit="kcal" />
        <TrackerCard label="Protein" value={totals.protein_g} target={defaultTargets.protein_g} unit="g" />
        <TrackerCard label="Carbs" value={totals.carbs_g} target={defaultTargets.carbs_g} unit="g" />
        <TrackerCard label="Fat" value={totals.fat_g} target={defaultTargets.fat_g} unit="g" />
      </div>
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

function TrackerCard({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}{unit}</p>
        <p className="mt-1 text-sm text-muted-foreground">Target {target}{unit}</p>
        <Progress value={percent(value, target)} className="mt-4" />
      </CardContent>
    </Card>
  );
}
