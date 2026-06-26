"use client";

import type { BodyMeasurement, DailyNutritionSummary, FitnessHabit, PersonalRecord, ProgressEntry, WorkoutSession } from "@/types";
import type { EnhancedSleepRecoveryLog } from "@/services/wellness/wellness-data";
import { addDays, datesInRange, endOfMonth, endOfWeek, formatIsoDate, startOfMonth, startOfWeek, todayIso } from "@/lib/date-utils";
import { nullablePercent } from "@/services/nutrition/calculations";

export type ReportRange = { start: string; end: string; label: string; kind: "weekly" | "monthly" };
export type ReportMetric = { label: string; value: string; detail: string; empty?: boolean };
export type AggregatedReport = {
  range: ReportRange;
  workoutsCompleted: number | null;
  workoutsSkipped: number | null;
  workoutAdherence: number | null;
  averageCalories: number | null;
  averageProtein: number | null;
  waterAverage: number | null;
  weightChange: number | null;
  weightTrend: string;
  measurementChanges: Array<{ label: string; value: number | null; unit: string }>;
  habitCompletion: number | null;
  habitCompletedDays: number;
  habitMissedDays: number;
  sleepAverage: number | null;
  prs: PersonalRecord[];
  missedDays: number;
  nutritionDaysLogged: number;
};

export function buildWeekRange(selectedDate: string): ReportRange { const start = startOfWeek(selectedDate); const end = endOfWeek(selectedDate); return { start, end, kind: "weekly", label: `${formatDate(start)} - ${formatDate(end)}` }; }
export function buildMonthRange(monthDate: string): ReportRange { const start = startOfMonth(monthDate); const end = endOfMonth(monthDate); return { start, end, kind: "monthly", label: formatIsoDate(start, { month: "long", year: "numeric" }) }; }
export { addDays, datesInRange, endOfMonth, endOfWeek, startOfMonth, startOfWeek, todayIso };
export function formatDate(value: string) { return formatIsoDate(value); }

function dateOfSession(session: WorkoutSession) { return (session.completed_at || session.skipped_at || session.started_at || "").slice(0, 10); }
function inRange(date: string | null | undefined, range: ReportRange) { return Boolean(date && date >= range.start && date <= range.end); }
function average(values: number[]) { const valid = values.filter((value) => Number.isFinite(value)); return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null; }
function round(value: number) { return Math.round(value * 10) / 10; }
function firstLastNumber<T>(items: T[], getValue: (item: T) => number | null | undefined) { const values = items.map(getValue).filter((value): value is number => typeof value === "number" && Number.isFinite(value)); if (values.length < 2) return null; return round(values[values.length - 1] - values[0]); }
function measurementValue(entry: ProgressEntry, key: keyof BodyMeasurement) { const value = entry.measurements?.[key]; return typeof value === "number" && Number.isFinite(value) ? value : null; }
function measurementChanges(entries: ProgressEntry[]) {
  const defs: Array<{ key: keyof BodyMeasurement; label: string; unit: string; combine?: (entry: ProgressEntry) => number | null }> = [
    { key: "waist_cm", label: "Waist", unit: "cm", combine: (entry) => measurementValue(entry, "waist_cm") ?? entry.waist_cm ?? null },
    { key: "chest_cm", label: "Chest", unit: "cm" },
    { key: "hips_cm", label: "Hips", unit: "cm" },
    { key: "shoulders_cm", label: "Shoulders", unit: "cm" },
    { key: "left_arm_cm", label: "Left arm", unit: "cm" },
    { key: "right_arm_cm", label: "Right arm", unit: "cm" },
    { key: "left_thigh_cm", label: "Left thigh", unit: "cm" },
    { key: "right_thigh_cm", label: "Right thigh", unit: "cm" },
    { key: "calves_cm", label: "Calves", unit: "cm" },
    { key: "body_fat_percent", label: "Manual body fat", unit: "%" }
  ];
  return defs.map((def) => ({ label: def.label, unit: def.unit, value: firstLastNumber(entries, (entry) => def.combine ? def.combine(entry) : measurementValue(entry, def.key)) }));
}

function habitCompletionStats(habits: FitnessHabit[], range: ReportRange) {
  const periodHabits = habits.filter((habit) => inRange(habit.habit_date, range));
  if (!periodHabits.length) return { completion: null, completedDays: 0, missedDays: datesInRange(range.start, range.end).length };
  const byDate = new Map<string, { total: number; completed: number }>();
  periodHabits.forEach((habit) => { const current = byDate.get(habit.habit_date) ?? { total: 0, completed: 0 }; current.total += 1; if (habit.completed) current.completed += 1; byDate.set(habit.habit_date, current); });
  const completedItems = periodHabits.filter((habit) => habit.completed).length;
  const completedDays = Array.from(byDate.values()).filter((day) => day.total > 0 && day.completed === day.total).length;
  return { completion: nullablePercent(completedItems, periodHabits.length), completedDays, missedDays: datesInRange(range.start, range.end).filter((date) => !(byDate.get(date)?.completed ?? 0)).length };
}

export function aggregateReport({ range, nutrition, workouts, progressEntries, habits, sleepLogs, personalRecords }: { range: ReportRange; nutrition: DailyNutritionSummary[]; workouts: WorkoutSession[]; progressEntries: ProgressEntry[]; habits: FitnessHabit[]; sleepLogs: EnhancedSleepRecoveryLog[]; personalRecords: PersonalRecord[] }): AggregatedReport {
  const periodDates = datesInRange(range.start, range.end);
  const periodNutrition = nutrition.filter((day) => inRange(day.date, range));
  const loggedNutritionDays = periodNutrition.filter((day) => day.logs.length > 0);
  const waterDays = periodNutrition.filter((day) => day.water_ml > 0);
  const periodWorkouts = workouts.filter((session) => inRange(dateOfSession(session), range));
  const completedWorkouts = periodWorkouts.filter((session) => session.status === "completed").length;
  const skippedWorkouts = periodWorkouts.filter((session) => session.status === "skipped").length;
  const periodProgress = progressEntries.filter((entry) => inRange(entry.entry_date, range)).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const periodSleep = sleepLogs.filter((log) => inRange(log.log_date, range));
  const periodPrs = personalRecords.filter((record) => inRange(record.record_date, range));
  const habitStats = habitCompletionStats(habits, range);
  const activeDays = new Set<string>();
  loggedNutritionDays.forEach((day) => activeDays.add(day.date));
  periodWorkouts.forEach((session) => activeDays.add(dateOfSession(session)));
  habits.filter((habit) => inRange(habit.habit_date, range) && habit.completed).forEach((habit) => activeDays.add(habit.habit_date));
  periodSleep.forEach((log) => activeDays.add(log.log_date));
  waterDays.forEach((day) => activeDays.add(day.date));
  const weightChange = firstLastNumber(periodProgress, (entry) => entry.body_weight_kg);
  return {
    range,
    workoutsCompleted: periodWorkouts.length ? completedWorkouts : null,
    workoutsSkipped: periodWorkouts.length ? skippedWorkouts : null,
    workoutAdherence: nullablePercent(completedWorkouts, completedWorkouts + skippedWorkouts),
    averageCalories: loggedNutritionDays.length ? average(loggedNutritionDays.map((day) => day.calories)) : null,
    averageProtein: loggedNutritionDays.length ? average(loggedNutritionDays.map((day) => day.protein_g)) : null,
    waterAverage: waterDays.length ? average(waterDays.map((day) => day.water_ml)) : null,
    weightChange,
    weightTrend: weightChange === null ? "Not enough weight entries for a trend." : weightChange > 0 ? "Weight increased over this period." : weightChange < 0 ? "Weight decreased over this period." : "Weight stayed flat over this period.",
    measurementChanges: measurementChanges(periodProgress),
    habitCompletion: habitStats.completion,
    habitCompletedDays: habitStats.completedDays,
    habitMissedDays: habitStats.missedDays,
    sleepAverage: periodSleep.filter((log) => typeof log.hours_slept === "number").length ? round(periodSleep.filter((log) => typeof log.hours_slept === "number").reduce((sum, log) => sum + Number(log.hours_slept), 0) / periodSleep.filter((log) => typeof log.hours_slept === "number").length) : null,
    prs: periodPrs,
    missedDays: periodDates.filter((date) => !activeDays.has(date)).length,
    nutritionDaysLogged: loggedNutritionDays.length
  };
}

export function reportMetrics(report: AggregatedReport, mode: "weekly" | "monthly"): ReportMetric[] {
  const month = mode === "monthly";
  return [
    { label: month ? "Workouts completed this month" : "Workouts completed", value: report.workoutsCompleted === null ? "No workouts logged" : String(report.workoutsCompleted), detail: report.workoutsSkipped === null ? "No skipped workout data in this period." : `${report.workoutsSkipped} skipped workout(s).`, empty: report.workoutsCompleted === null },
    { label: "Adherence rate", value: report.workoutAdherence === null ? "Not enough data" : `${report.workoutAdherence}%`, detail: "Completed vs completed + skipped workouts.", empty: report.workoutAdherence === null },
    { label: "Average calories", value: report.averageCalories === null ? "Not enough data" : `${report.averageCalories} kcal`, detail: `${report.nutritionDaysLogged} day(s) with food logs.`, empty: report.averageCalories === null },
    { label: "Average protein", value: report.averageProtein === null ? "Not enough data" : `${report.averageProtein} g`, detail: "Average protein from logged food days only.", empty: report.averageProtein === null },
    { label: "Water average", value: report.waterAverage === null ? "Not enough data" : `${report.waterAverage} ml`, detail: "Average water from days with water logs only.", empty: report.waterAverage === null },
    { label: "Weight change", value: report.weightChange === null ? "Not enough data" : `${formatDelta(report.weightChange)} kg`, detail: report.weightTrend, empty: report.weightChange === null },
    { label: "Habit completion", value: report.habitCompletion === null ? "No habit completions" : `${report.habitCompletion}%`, detail: `${report.habitCompletedDays} full completion day(s), ${report.habitMissedDays} missed day(s).`, empty: report.habitCompletion === null },
    { label: "Sleep average", value: report.sleepAverage === null ? "Not enough data" : `${report.sleepAverage} h`, detail: "Average from saved sleep logs only.", empty: report.sleepAverage === null },
    { label: "PRs achieved", value: report.prs.length ? String(report.prs.length) : "No PRs achieved", detail: report.prs.length ? report.prs.slice(0, 3).map((record) => `${record.exercise_name} ${record.record_type}`).join(" | ") : "No PRs achieved in this period.", empty: !report.prs.length },
    { label: "Missed days", value: String(report.missedDays), detail: "Days without workouts, food, water, sleep, or completed habit records." }
  ];
}

export function formatDelta(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
export function escapeCsv(value: string | number | null | undefined) { const text = value === null || value === undefined ? "" : String(value); return `"${text.replace(/"/g, '""')}"`; }
export function reportToCsv(report: AggregatedReport) {
  const rows = [
    ["Report range", report.range.label],
    ["Start", report.range.start],
    ["End", report.range.end],
    ["Workouts completed", report.workoutsCompleted ?? "Not enough data"],
    ["Workouts skipped", report.workoutsSkipped ?? "Not enough data"],
    ["Workout adherence %", report.workoutAdherence ?? "Not enough data"],
    ["Average calories", report.averageCalories ?? "Not enough data"],
    ["Average protein g", report.averageProtein ?? "Not enough data"],
    ["Water average ml", report.waterAverage ?? "Not enough data"],
    ["Weight change kg", report.weightChange ?? "Not enough data"],
    ["Habit completion %", report.habitCompletion ?? "No habit completions"],
    ["Sleep average h", report.sleepAverage ?? "Not enough data"],
    ["PRs achieved", report.prs.length],
    ["Missed days", report.missedDays],
    ...report.measurementChanges.map((item) => [`Measurement change ${item.label} ${item.unit}`, item.value ?? "Not enough data"])
  ];
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) { const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
export function printableReportHtml(report: AggregatedReport, metrics: ReportMetric[]) { return `<!doctype html><html><head><title>Plaivra Report ${report.range.label}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{margin-bottom:4px}.muted{color:#666}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{border:1px solid #ddd;border-radius:8px;padding:12px}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body><h1>Plaivra ${report.range.kind} report</h1><p class="muted">${report.range.label} | Real saved data only</p><div class="grid">${metrics.map((metric) => `<div class="card"><strong>${metric.label}</strong><p>${metric.value}</p><small>${metric.detail}</small></div>`).join("")}</div><h2>Measurement changes</h2><table><thead><tr><th>Measurement</th><th>Change</th></tr></thead><tbody>${report.measurementChanges.map((item) => `<tr><td>${item.label}</td><td>${item.value === null ? "Not enough data" : `${formatDelta(item.value)} ${item.unit}`}</td></tr>`).join("")}</tbody></table></body></html>`; }
