export type ProgressSourceState = "loading" | "loaded" | "failed";

export type ProgressMetricStatus =
  | "loading"
  | "unavailable"
  | "target-unavailable"
  | "no-target"
  | "under"
  | "at"
  | "over";

export type ProgressMetricState = {
  status: ProgressMetricStatus;
  consumed: number | null;
  target: number | null;
  remaining: number | null;
  overBy: number | null;
  progress: number | undefined;
};

export function resolveProgressMetricState({
  consumed,
  target,
  consumedState,
  targetState
}: {
  consumed: number | null;
  target: number | null;
  consumedState: ProgressSourceState;
  targetState: ProgressSourceState;
}): ProgressMetricState {
  if (consumedState === "loading") {
    return { status: "loading", consumed: null, target: null, remaining: null, overBy: null, progress: undefined };
  }
  if (consumedState === "failed" || consumed === null || !Number.isFinite(consumed)) {
    return { status: "unavailable", consumed: null, target: null, remaining: null, overBy: null, progress: undefined };
  }

  const safeConsumed = Math.max(0, consumed);
  if (targetState === "loading") {
    return { status: "loading", consumed: safeConsumed, target: null, remaining: null, overBy: null, progress: undefined };
  }
  if (targetState === "failed") {
    return { status: "target-unavailable", consumed: safeConsumed, target: null, remaining: null, overBy: null, progress: undefined };
  }
  if (target === null || !Number.isFinite(target) || target <= 0) {
    return { status: "no-target", consumed: safeConsumed, target: null, remaining: null, overBy: null, progress: undefined };
  }

  const safeTarget = target;
  const difference = safeTarget - safeConsumed;
  const progress = Math.min(100, Math.max(0, (safeConsumed / safeTarget) * 100));
  if (difference < 0) {
    return { status: "over", consumed: safeConsumed, target: safeTarget, remaining: 0, overBy: Math.abs(difference), progress };
  }
  if (difference === 0) {
    return { status: "at", consumed: safeConsumed, target: safeTarget, remaining: 0, overBy: 0, progress };
  }
  return { status: "under", consumed: safeConsumed, target: safeTarget, remaining: difference, overBy: 0, progress };
}
