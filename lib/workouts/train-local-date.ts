import { localDateToIso } from "@/lib/date-utils";

export type TrainDateEventTarget = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export type TrainDateRefreshDependencies = {
  getNow: () => Date;
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  windowTarget: TrainDateEventTarget;
  documentTarget: TrainDateEventTarget;
  isDocumentVisible: () => boolean;
};

export function millisecondsUntilNextLocalMidnight(now: Date) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
  return Math.max(50, next.getTime() - now.getTime());
}

export function startTrainLocalDateRefresh(input: {
  initialDate: string;
  onDateChange: (date: string) => void;
  onWake?: () => void;
  dependencies: TrainDateRefreshDependencies;
}) {
  let active = true;
  let currentDate = input.initialDate;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const { dependencies } = input;

  const schedule = () => {
    if (!active) return;
    if (timer !== null) dependencies.clearTimer(timer);
    const now = dependencies.getNow();
    timer = dependencies.setTimer(checkDate, millisecondsUntilNextLocalMidnight(now));
  };

  const checkDate = () => {
    if (!active) return;
    const nextDate = localDateToIso(dependencies.getNow());
    if (nextDate !== currentDate) {
      currentDate = nextDate;
      input.onDateChange(nextDate);
    }
    input.onWake?.();
    schedule();
  };

  const onFocus = () => checkDate();
  const onVisibility = () => {
    if (dependencies.isDocumentVisible()) checkDate();
  };

  dependencies.windowTarget.addEventListener("focus", onFocus);
  dependencies.documentTarget.addEventListener("visibilitychange", onVisibility);
  schedule();

  return () => {
    active = false;
    if (timer !== null) dependencies.clearTimer(timer);
    dependencies.windowTarget.removeEventListener("focus", onFocus);
    dependencies.documentTarget.removeEventListener("visibilitychange", onVisibility);
  };
}

export function resolveTrainWeekSelection(currentIso: string, todayIso: string, weekIsos: string[]) {
  if (weekIsos.includes(todayIso)) return todayIso;
  return weekIsos.includes(currentIso) ? currentIso : weekIsos[0] ?? todayIso;
}
