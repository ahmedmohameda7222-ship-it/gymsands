// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Phase3SessionAnalysisContract } from "@/lib/train/muscle-intelligence/session-analysis-contract";
import {
  resolveActiveWorkoutMuscleLoadAnalysis,
  resolveActiveWorkoutMuscleLoadState,
  useActiveWorkoutMuscleLoad,
  type ActiveWorkoutMuscleLoadController
} from "./active-workout-muscle-load-controller";

function payload(
  effectiveCompleteness: Phase3SessionAnalysisContract["effectiveCompleteness"] = "complete",
  level: "inactive" | "low" = "low"
): Phase3SessionAnalysisContract {
  return {
    sessionId: "session-1",
    snapshotId: `snapshot-${effectiveCompleteness}-${level}`,
    snapshotSchemaVersion: "workout_session_muscle_snapshot_v1",
    frozenAt: "2026-07-30T08:00:00.000Z",
    source: "session_start",
    snapshotCompleteness: effectiveCompleteness === "unavailable" ? "unavailable" : "complete",
    reasonCodes: [],
    effectiveCompleteness,
    effectiveWarnings: [],
    analysis: {
      schemaVersion: "muscle_analysis_result_v1",
      taxonomyVersion: "muscle_taxonomy_v1",
      engineVersion: "muscle_load_resistance_sets_v1",
      thresholdVersion: "muscle_load_thresholds_v1",
      mode: "active",
      period: { kind: "session" },
      completeness: "complete",
      muscles: [{
        muscleId: "pectoralis_major",
        rawScore: level === "inactive" ? 0 : 1,
        levelInputScore: level === "inactive" ? 0 : 1,
        level
      }],
      contributionBreakdown: [],
      mappingVersionsUsed: [],
      coverage: {
        totalItemCount: 1,
        includedItemCount: 1,
        unmappedItemCount: 0,
        unsupportedItemCount: 0
      },
      warnings: []
    }
  } as Phase3SessionAnalysisContract;
}

function response(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

let observed: ActiveWorkoutMuscleLoadController | null = null;

function Harness({
  sessionId,
  refreshRevision
}: {
  sessionId: string | null;
  refreshRevision: number;
}) {
  const controller = useActiveWorkoutMuscleLoad({ sessionId, refreshRevision });
  useEffect(() => {
    observed = controller;
  }, [controller]);
  return <div data-state={controller.state} />;
}

async function render(
  sessionId: string | null,
  refreshRevision = 0
): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness sessionId={sessionId} refreshRevision={refreshRevision} />);
  });
  return { root, container };
}

describe("AW-6 active workout Muscle Load controller", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    observed = null;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("does not request without a session ID and requests once per revision", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(() => response(payload()));
    const runtime = await render(null);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      runtime.root.render(<Harness sessionId="session-1" refreshRevision={0} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/workouts/sessions/session-1/muscle-analysis?mode=active",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) })
    );

    await act(async () => {
      runtime.root.render(<Harness sessionId="session-1" refreshRevision={0} />);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      runtime.root.render(<Harness sessionId="session-1" refreshRevision={1} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => runtime.root.unmount());
  });

  it("ignores a stale response and keeps the newest generation", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.mocked(fetch)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const runtime = await render("session-1");

    await act(async () => {
      runtime.root.render(<Harness sessionId="session-1" refreshRevision={1} />);
    });
    await act(async () => {
      second.resolve(await response(payload("partial")));
      await Promise.resolve();
      await Promise.resolve();
    });
    const newestSnapshot = observed?.result?.snapshotId;
    await act(async () => {
      first.resolve(await response(payload("complete", "inactive")));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(observed?.result?.snapshotId).toBe(newestSnapshot);
    expect(observed?.state).toBe("partial");
    await act(async () => runtime.root.unmount());
  });

  it("retains cached analysis while refreshing and after refresh failure", async () => {
    const refresh = deferred<Response>();
    vi.mocked(fetch)
      .mockImplementationOnce(() => response(payload()))
      .mockImplementationOnce(() => refresh.promise);
    const runtime = await render("session-1");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const cached = observed?.result;

    await act(async () => {
      runtime.root.render(<Harness sessionId="session-1" refreshRevision={1} />);
    });
    expect(observed?.refreshing).toBe(true);
    expect(observed?.result).toBe(cached);

    await act(async () => {
      refresh.resolve(await response({ error: "offline" }, 503));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(observed?.failed).toBe(true);
    expect(observed?.hasCachedResult).toBe(true);
    expect(observed?.result).toBe(cached);
    expect(observed?.state).toBe("ready");
    await act(async () => runtime.root.unmount());
  });

  it("exposes an initial error without cached data", async () => {
    vi.mocked(fetch).mockImplementation(() => response({ error: "offline" }, 503));
    const runtime = await render("session-1");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(observed?.failed).toBe(true);
    expect(observed?.hasCachedResult).toBe(false);
    expect(observed?.state).toBe("error");
    await act(async () => runtime.root.unmount());
  });

  it("projects V1 compatibility and resolves empty, partial, unavailable, and ready", () => {
    const ready = payload();
    const readyAnalysis = resolveActiveWorkoutMuscleLoadAnalysis(ready);
    expect(readyAnalysis?.kind).toBe("broad_compatibility");
    expect(resolveActiveWorkoutMuscleLoadState({
      result: ready,
      analysis: readyAnalysis,
      loading: false,
      failed: false
    })).toBe("ready");

    const empty = payload("complete", "inactive");
    expect(resolveActiveWorkoutMuscleLoadState({
      result: empty,
      analysis: resolveActiveWorkoutMuscleLoadAnalysis(empty),
      loading: false,
      failed: false
    })).toBe("empty");

    const partial = payload("partial");
    expect(resolveActiveWorkoutMuscleLoadState({
      result: partial,
      analysis: resolveActiveWorkoutMuscleLoadAnalysis(partial),
      loading: false,
      failed: false
    })).toBe("partial");

    const unavailable = payload("unavailable");
    expect(resolveActiveWorkoutMuscleLoadState({
      result: unavailable,
      analysis: resolveActiveWorkoutMuscleLoadAnalysis(unavailable),
      loading: false,
      failed: false
    })).toBe("unavailable");
  });
});
