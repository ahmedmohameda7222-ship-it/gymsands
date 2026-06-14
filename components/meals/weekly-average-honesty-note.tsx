"use client";

import type { DailyNutritionSummary } from "@/types";

function safeAverage(total: number, count: number) {
  return count > 0 ? Math.round(total / count) : null;
}

export function WeeklyAverageHonestyNote({ weekData }: { weekData: DailyNutritionSummary[] }) {
  const loggedDays = weekData.filter((day) => day.logs.length > 0);
  const actual = weekData.reduce((sum, day) => sum + day.calories, 0);
  const protein = weekData.reduce((sum, day) => sum + day.protein_g, 0);
  const carbs = weekData.reduce((sum, day) => sum + day.carbs_g, 0);
  const fat = weekData.reduce((sum, day) => sum + day.fat_g, 0);
  const loggedCalories = loggedDays.reduce((sum, day) => sum + day.calories, 0);
  const loggedProtein = loggedDays.reduce((sum, day) => sum + day.protein_g, 0);
  const loggedCarbs = loggedDays.reduce((sum, day) => sum + day.carbs_g, 0);
  const loggedFat = loggedDays.reduce((sum, day) => sum + day.fat_g, 0);
  const loggedDayCount = loggedDays.length;

  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <p className="font-semibold">Average clarity</p>
      <p className="mt-1 text-muted-foreground">Calendar average divides by all 7 days. Logged-day average divides only by the {loggedDayCount}/7 days with food logs.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <AveragePair label="Calories" calendar={`${Math.round(actual / 7)} kcal`} logged={safeAverage(loggedCalories, loggedDayCount)} unit="kcal" />
        <AveragePair label="Protein" calendar={`${Math.round(protein / 7)}g`} logged={safeAverage(loggedProtein, loggedDayCount)} unit="g" />
        <AveragePair label="Carbs" calendar={`${Math.round(carbs / 7)}g`} logged={safeAverage(loggedCarbs, loggedDayCount)} unit="g" />
        <AveragePair label="Fat" calendar={`${Math.round(fat / 7)}g`} logged={safeAverage(loggedFat, loggedDayCount)} unit="g" />
      </div>
    </div>
  );
}

function AveragePair({ label, calendar, logged, unit }: { label: string; calendar: string; logged: number | null; unit: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">Calendar avg: {calendar}</p>
      <p className="text-xs text-muted-foreground">Logged-day avg: {logged === null ? "No logged days" : `${logged}${unit}`}</p>
    </div>
  );
}
