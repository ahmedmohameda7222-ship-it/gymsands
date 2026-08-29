export type CookingTimerStatus = "idle" | "running" | "paused" | "completed" | "cancelled";

export type CookingTimerSnapshot = {
  id: string;
  actionId: string;
  name: string;
  durationSeconds: number;
  status: CookingTimerStatus;
  startedAt: string | null;
  targetAt: string | null;
  pausedAt: string | null;
  pausedRemainingSeconds: number | null;
  completedAt: string | null;
};

export type CookingTimerFinishedEvent = {
  kind: "timer_finished";
  timerId: string;
  actionId: string;
  timerName: string;
};

export type ReconstructedCookingTimer = CookingTimerSnapshot & {
  remainingSeconds: number;
  expired: boolean;
  attentionEvent: CookingTimerFinishedEvent | null;
};

function timestampMs(value: string | Date, field: string) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid Cooking timer ${field}.`);
  return parsed;
}

function positiveDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Cooking timer durationSeconds must be greater than 0.");
  return Math.ceil(value);
}

function timerFinishedEvent(timer: CookingTimerSnapshot): CookingTimerFinishedEvent {
  return {
    kind: "timer_finished",
    timerId: timer.id,
    actionId: timer.actionId,
    timerName: timer.name,
  };
}

export function reconstructCookingTimer(
  timer: CookingTimerSnapshot,
  now: string | Date = new Date(),
): ReconstructedCookingTimer {
  const durationSeconds = positiveDuration(timer.durationSeconds);

  if (timer.status === "paused") {
    const remaining = timer.pausedRemainingSeconds;
    if (!Number.isFinite(remaining) || remaining === null || remaining < 0) {
      throw new Error("Paused Cooking timer requires pausedRemainingSeconds >= 0.");
    }
    return {
      ...timer,
      durationSeconds,
      remainingSeconds: Math.ceil(remaining),
      expired: false,
      attentionEvent: null,
    };
  }

  if (timer.status === "completed") {
    return {
      ...timer,
      durationSeconds,
      remainingSeconds: 0,
      expired: true,
      attentionEvent: timerFinishedEvent(timer),
    };
  }

  if (timer.status === "cancelled") {
    return {
      ...timer,
      durationSeconds,
      remainingSeconds: 0,
      expired: false,
      attentionEvent: null,
    };
  }

  if (timer.status === "idle") {
    return {
      ...timer,
      durationSeconds,
      remainingSeconds: durationSeconds,
      expired: false,
      attentionEvent: null,
    };
  }

  if (!timer.targetAt) throw new Error("Running Cooking timer requires targetAt.");
  const nowMs = timestampMs(now, "current time");
  const targetMs = timestampMs(timer.targetAt, "targetAt");
  const remainingSeconds = Math.max(0, Math.ceil((targetMs - nowMs) / 1000));

  if (targetMs <= nowMs) {
    return {
      ...timer,
      durationSeconds,
      status: "completed",
      completedAt: timer.completedAt ?? new Date(nowMs).toISOString(),
      remainingSeconds: 0,
      expired: true,
      attentionEvent: timerFinishedEvent(timer),
    };
  }

  return {
    ...timer,
    durationSeconds,
    remainingSeconds,
    expired: false,
    attentionEvent: null,
  };
}
