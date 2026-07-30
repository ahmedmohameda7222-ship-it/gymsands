"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AdvancedExposureResult } from "@/lib/train/muscle-intelligence/advanced-exposure";
import type { MuscleLoadAnalysisResult } from "@/lib/train/muscle-intelligence/calculate-muscle-load";
import {
  projectBroadMuscleCompatibility,
  type BroadCompatibilityResult
} from "@/lib/train/muscle-intelligence/compatibility-projection";
import type { Phase3SessionAnalysisContract } from "@/lib/train/muscle-intelligence/session-analysis-contract";

export type ActiveWorkoutMuscleLoadAnalysis =
  | AdvancedExposureResult
  | BroadCompatibilityResult
  | null;

export type ActiveWorkoutMuscleLoadState =
  | "ready"
  | "loading"
  | "empty"
  | "partial"
  | "unavailable"
  | "error";

export type ActiveWorkoutMuscleLoadController = {
  result: Phase3SessionAnalysisContract | null;
  analysis: ActiveWorkoutMuscleLoadAnalysis;
  state: ActiveWorkoutMuscleLoadState;
  loading: boolean;
  refreshing: boolean;
  failed: boolean;
  hasCachedResult: boolean;
  reload: () => void;
};

export function resolveActiveWorkoutMuscleLoadAnalysis(
  result: Phase3SessionAnalysisContract | null
): ActiveWorkoutMuscleLoadAnalysis {
  if (!result) return null;
  if (result.snapshotSchemaVersion === "workout_session_muscle_snapshot_v1") {
    return projectBroadMuscleCompatibility(result.analysis as MuscleLoadAnalysisResult);
  }
  return result.analysis as ActiveWorkoutMuscleLoadAnalysis;
}

export function activeWorkoutMuscleLoadHasExposure(
  analysis: ActiveWorkoutMuscleLoadAnalysis
): boolean {
  if (!analysis) return false;
  return analysis.kind === "advanced"
    ? analysis.targets.some((target) => target.rawExposure > 0)
    : analysis.targets.some((target) => target.heatLevel !== "none");
}

export function resolveActiveWorkoutMuscleLoadState({
  result,
  analysis,
  loading,
  failed
}: {
  result: Phase3SessionAnalysisContract | null;
  analysis: ActiveWorkoutMuscleLoadAnalysis;
  loading: boolean;
  failed: boolean;
}): ActiveWorkoutMuscleLoadState {
  if (loading && !result) return "loading";
  if (failed && !result) return "error";
  if (!result || !analysis) return "unavailable";
  if (result.effectiveCompleteness === "unavailable") return "unavailable";
  if (!activeWorkoutMuscleLoadHasExposure(analysis)) return "empty";
  if (
    result.effectiveCompleteness === "partial"
    || result.effectiveCompleteness === "limited"
  ) return "partial";
  return "ready";
}

function isAnalysisPayload(value: unknown): value is Phase3SessionAnalysisContract {
  return Boolean(
    value
    && typeof value === "object"
    && "snapshotId" in value
    && "effectiveCompleteness" in value
  );
}

function responseError(value: unknown): string {
  if (
    value
    && typeof value === "object"
    && "error" in value
    && typeof value.error === "string"
    && value.error
  ) return value.error;
  return "Active muscle load request failed.";
}

export function useActiveWorkoutMuscleLoad({
  sessionId,
  refreshRevision
}: {
  sessionId: string | null;
  refreshRevision: number;
}): ActiveWorkoutMuscleLoadController {
  const [result, setResult] = useState<Phase3SessionAnalysisContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadRevision, setReloadRevision] = useState(0);
  const requestGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<Phase3SessionAnalysisContract | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    const generation = ++requestGenerationRef.current;
    const hasPrevious = resultRef.current !== null;
    setLoading(!hasPrevious);
    setRefreshing(hasPrevious);
    setFailed(false);

    try {
      const response = await fetch(
        `/api/workouts/sessions/${encodeURIComponent(sessionId)}/muscle-analysis?mode=active`,
        { cache: "no-store", signal: abortController.signal }
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isAnalysisPayload(payload)) {
        throw new Error(responseError(payload));
      }
      if (
        abortController.signal.aborted
        || generation !== requestGenerationRef.current
      ) return;
      resultRef.current = payload;
      setResult(payload);
    } catch (error) {
      if (
        abortController.signal.aborted
        || generation !== requestGenerationRef.current
      ) return;
      console.warn("Plaivra could not refresh active muscle load.", error);
      setFailed(true);
    } finally {
      if (
        !abortController.signal.aborted
        && generation === requestGenerationRef.current
      ) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionIdRef.current !== sessionId) {
      abortRef.current?.abort();
      requestGenerationRef.current += 1;
      sessionIdRef.current = sessionId;
      resultRef.current = null;
      setResult(null);
      setLoading(false);
      setRefreshing(false);
      setFailed(false);
    }
    if (!sessionId) return;
    void load();
    return () => {
      abortRef.current?.abort();
      requestGenerationRef.current += 1;
    };
  }, [load, refreshRevision, reloadRevision, sessionId]);

  const analysis = useMemo(
    () => resolveActiveWorkoutMuscleLoadAnalysis(result),
    [result]
  );
  const state = resolveActiveWorkoutMuscleLoadState({
    result,
    analysis,
    loading,
    failed
  });
  const reload = useCallback(() => {
    setReloadRevision((current) => current + 1);
  }, []);

  return {
    result,
    analysis,
    state,
    loading,
    refreshing,
    failed,
    hasCachedResult: result !== null,
    reload
  };
}
