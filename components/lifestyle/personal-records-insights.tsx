"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { getPersonalRecords } from "@/services/database/progress";
import type { PersonalRecord } from "@/types";

export function PersonalRecordsInsights() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadRecords = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError("");
    try {
      setRecords(await getPersonalRecords(userId, 100, { throwOnError: true }));
    } catch (error) {
      setRecords([]);
      setLoadError(error instanceof Error ? error.message : "Personal record insights could not load.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadRecords();
    window.addEventListener("plaivra:personal-records-changed", loadRecords);
    return () => window.removeEventListener("plaivra:personal-records-changed", loadRecords);
  }, [loadRecords]);

  const insights = useMemo(() => buildRecordInsights(records), [records]);
  const groupedByExercise = useMemo(() => buildExerciseGroups(records), [records]);

  if (isLoading) return <CardSkeleton rows={4} />;
  if (loadError) return <ErrorState title="Record insights could not load" description={`${loadError} Saved records were not changed.`} onRetry={loadRecords} className="[&_button]:h-12" />;

  return (
    <div className="space-y-4">
      {/* Hero summary */}
      <div className="glass-card-strong p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Personal Records</p>
          <p className="text-xs text-muted-foreground">{records.length} record{records.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-3xl font-bold tracking-tight">{records.length ? String(records.length) : "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Saved records</p>
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight">{insights.bestWeight ? `${insights.bestWeight.weight_kg} kg` : "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Best max weight</p>
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight">{insights.bestOneRepMax ? `${insights.bestOneRepMax.estimate} kg` : "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Best est. 1RM</p>
          </div>
        </div>
        {insights.bestWeight && (
          <p className="mt-3 text-sm text-muted-foreground">
            Best lift: <span className="font-medium text-foreground">{insights.bestWeight.exercise_name}</span> on {insights.bestWeight.record_date}
          </p>
        )}
        {!records.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Personal records can be added manually or detected from completed workouts. Add your first record below, start a workout, or review workout history.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Estimated 1RM is calculated from saved workout sets when available.</p>
        )}
      </div>

      {/* Exercise group summary */}
      {groupedByExercise.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groupedByExercise.slice(0, 6).map((group) => (
            <div key={group.exercise_name} className="glass-card p-3">
              <p className="text-sm font-semibold text-foreground">{group.exercise_name}</p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-lg font-bold">{group.bestWeight ? `${group.bestWeight} kg` : "—"}</p>
                {group.bestOneRepMax && <p className="text-xs text-muted-foreground mb-0.5">1RM est. {group.bestOneRepMax} kg</p>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{group.count} record{group.count !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildExerciseGroups(records: PersonalRecord[]) {
  const grouped = new Map<string, { exercise_name: string; count: number; bestWeight: number | null; bestOneRepMax: number | null }>();
  records.forEach((record) => {
    const name = record.exercise_name.trim();
    if (!name) return;
    const existing = grouped.get(name) ?? { exercise_name: name, count: 0, bestWeight: null, bestOneRepMax: null };
    existing.count += 1;
    if (record.record_type === "Max weight" && typeof record.weight_kg === "number" && (existing.bestWeight === null || record.weight_kg > existing.bestWeight)) {
      existing.bestWeight = record.weight_kg;
    }
    if (record.record_type === "Estimated 1RM" && typeof record.weight_kg === "number" && typeof record.reps === "number" && record.reps > 0 && (existing.bestOneRepMax === null || record.weight_kg > existing.bestOneRepMax)) {
      existing.bestOneRepMax = record.weight_kg;
    }
    grouped.set(name, existing);
  });
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
}

function buildRecordInsights(records: PersonalRecord[]) {
  const weighted = records.filter((record) => record.record_type === "Max weight" && typeof record.weight_kg === "number") as Array<PersonalRecord & { weight_kg: number }>;
  const bestWeight = weighted.sort((a, b) => b.weight_kg - a.weight_kg)[0] ?? null;
  const bestOneRepMax = records
    .filter((record) => record.record_type === "Estimated 1RM" && typeof record.weight_kg === "number")
    .filter((record): record is PersonalRecord & { weight_kg: number; reps: number } => typeof record.reps === "number" && record.reps > 0)
    .map((record) => ({ ...record, estimate: record.weight_kg }))
    .sort((a, b) => b.estimate - a.estimate)[0] ?? null;
  return { bestWeight, bestOneRepMax };
}
