"use client";

import type { DailyNutritionSummary } from "@/types";

function nullableTotal(values: Array<number | null>) {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

function safeAverage(values: Array<number | null>, count: number) {
  if (count <= 0) return null;
  const total = nullableTotal(values);
  return total === null ? null : Math.round(total / count);
}

export function WeeklyAverageHonestyNote({ weekData }: { weekData: DailyNutritionSummary[] }) {
  const loggedDays = weekData.filter((day) => day.logs.length > 0);
  const loggedDayCount = loggedDays.length;
  const calendarCalories = safeAverage(weekData.map((day) => day.calories), 7);
  const calendarProtein = safeAverage(weekData.map((day) => day.protein_g), 7);
  const calendarCarbs = safeAverage(weekData.map((day) => day.carbs_g), 7);
  const calendarFat = safeAverage(weekData.map((day) => day.fat_g), 7);
  const loggedCalories = safeAverage(loggedDays.map((day) => day.calories), loggedDayCount);
  const loggedProtein = safeAverage(loggedDays.map((day) => day.protein_g), loggedDayCount);
  const loggedCarbs = safeAverage(loggedDays.map((day) => day.carbs_g), loggedDayCount);
  const loggedFat = safeAverage(loggedDays.map((day) => day.fat_g), loggedDayCount);

  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <p className="font-semibold">Average clarity</p>
      <p className="mt-1 text-muted-foreground">Calendar average divides by all 7 days. Logged-day average divides only by the {loggedDayCount}/7 days with food logs.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <AveragePair label="Calories" calendar={calendarCalories} logged={loggedCalories} unit="kcal" />
        <AveragePair label="Protein" calendar={calendarProtein} logged={loggedProtein} unit="g" />
        <AveragePair label="Carbs" calendar={calendarCarbs} logged={loggedCarbs} unit="g" />
        <AveragePair label="Fat" calendar={calendarFat} logged={loggedFat} unit="g" />
      </div>
    </div>
  );
}

function AveragePair({ label, calendar, logged, unit }: { label: string; calendar: number | null; logged: number | null; unit: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">Calendar avg: {calendar === null ? "—" : `${calendar}${unit}`}</p>
      <p className="text-xs text-muted-foreground">Logged-day avg: {logged === null ? "—" : `${logged}${unit}`}</p>
    </div>
  );
}