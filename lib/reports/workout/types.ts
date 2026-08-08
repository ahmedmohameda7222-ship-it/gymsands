import type { ReportDirection, ReportLanguage } from "@/lib/reports/pdf/types";

export type WorkoutReportValue = string | number | null;

export type WorkoutReportSet = Readonly<{
  number: number;
  state: "performed" | "missing" | "unplanned";
  setType: string | null;
  plannedTarget: string | null;
  actualResult: string | null;
  rpe: number | null;
  rir: number | null;
  notes: string | null;
  verifiedRecordCount: number;
}>;

export type WorkoutReportExercise = Readonly<{
  name: string;
  plannedName: string | null;
  state: "planned" | "replaced" | "skipped" | "adjusted" | "completed" | "unknown";
  plannedSetCount: number | null;
  performedSetCount: number;
  missingSetCount: number;
  unplannedSetCount: number;
  sets: readonly WorkoutReportSet[];
}>;

export type WorkoutReportModel = Readonly<{
  language: ReportLanguage;
  direction: ReportDirection;
  timezone: string;
  generatedAt: string;
  sessionAt: string;
  title: string;
  category: string | null;
  lifecycle: "completed" | "partial" | "cancelled" | "skipped";
  notes: string | null;
  summary: Readonly<{
    durationMinutes: number | null;
    exerciseCount: number | null;
    performedSetCount: number | null;
    plannedSetCount: number | null;
    reliableVolume: number | null;
    verifiedRecordCount: number | null;
  }>;
  highlights: readonly string[];
  exercises: readonly WorkoutReportExercise[];
}>;
