export type WorkoutHistoryDateRange = {
  from: string;
  to: string;
  timezone: string;
};

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

function validTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function workoutHistoryTimeZoneParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function offsetAt(date: Date, timezone: string): number {
  const parts = workoutHistoryTimeZoneParts(date, timezone);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ) - Math.floor(date.getTime() / 1000) * 1000;
}

export function zonedLocalDateTimeToIso(
  value: LocalDateTime,
  timezone: string,
): string {
  if (!validTimeZone(timezone)) throw new Error("Workout History timezone is invalid.");
  const localAsUtc = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour ?? 0,
    value.minute ?? 0,
    value.second ?? 0,
    value.millisecond ?? 0,
  );
  let candidate = new Date(localAsUtc);
  candidate = new Date(localAsUtc - offsetAt(candidate, timezone));
  candidate = new Date(localAsUtc - offsetAt(candidate, timezone));
  return candidate.toISOString();
}

export function currentMonthWorkoutHistoryRange(
  now: Date,
  timezone: string,
): WorkoutHistoryDateRange {
  const current = workoutHistoryTimeZoneParts(now, timezone);
  const nextMonth = current.month === 12
    ? { year: current.year + 1, month: 1 }
    : { year: current.year, month: current.month + 1 };
  return {
    from: zonedLocalDateTimeToIso({ year: current.year, month: current.month, day: 1 }, timezone),
    to: zonedLocalDateTimeToIso({ ...nextMonth, day: 1 }, timezone),
    timezone,
  };
}

export type WorkoutHistoryPeriodMode = "week" | "month" | "three-months" | "custom";

function calendarDate(value: Date): Pick<LocalDateTime, "year" | "month" | "day"> {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function localCalendarDate(anchor: Date, timezone: string): Date {
  const parts = workoutHistoryTimeZoneParts(anchor, timezone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

function startOfLocalWeek(anchor: Date): Date {
  const start = new Date(anchor);
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return start;
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addUtcMonths(value: Date, months: number): Date {
  const result = new Date(value);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function localDateToIso(value: Date, timezone: string): string {
  return zonedLocalDateTimeToIso(calendarDate(value), timezone);
}

export function workoutHistoryPeriodRange(
  mode: Exclude<WorkoutHistoryPeriodMode, "custom">,
  anchor: Date,
  timezone: string,
): WorkoutHistoryDateRange {
  const localAnchor = localCalendarDate(anchor, timezone);
  if (mode === "week") {
    const from = startOfLocalWeek(localAnchor);
    return {
      from: localDateToIso(from, timezone),
      to: localDateToIso(addUtcDays(from, 7), timezone),
      timezone,
    };
  }
  const currentMonth = new Date(Date.UTC(
    localAnchor.getUTCFullYear(),
    localAnchor.getUTCMonth(),
    1,
    12,
  ));
  const from = mode === "three-months" ? addUtcMonths(currentMonth, -2) : currentMonth;
  return {
    from: localDateToIso(from, timezone),
    to: localDateToIso(addUtcMonths(currentMonth, 1), timezone),
    timezone,
  };
}

export function customWorkoutHistoryPeriodRange(
  fromDate: string,
  toDate: string,
  timezone: string,
): WorkoutHistoryDateRange {
  const from = new Date(`${fromDate}T12:00:00.000Z`);
  const to = new Date(`${toDate}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(toDate)) {
    throw new Error("Workout History custom period is invalid.");
  }
  return validateWorkoutHistoryDateRange(
    localDateToIso(from, timezone),
    localDateToIso(addUtcDays(to, 1), timezone),
    timezone,
  );
}

export function shiftWorkoutHistoryPeriodAnchor(
  anchor: Date,
  mode: Exclude<WorkoutHistoryPeriodMode, "custom">,
  direction: -1 | 1,
): Date {
  if (mode === "week") return addUtcDays(anchor, direction * 7);
  return addUtcMonths(anchor, direction * (mode === "three-months" ? 3 : 1));
}

export function validateWorkoutHistoryDateRange(
  from: string,
  to: string,
  timezone: string,
): WorkoutHistoryDateRange {
  if (!validTimeZone(timezone)) throw new Error("Workout History timezone is invalid.");
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    throw new Error("Workout History date range is invalid.");
  }
  if (toMs - fromMs > 366 * 24 * 60 * 60 * 1000) {
    throw new Error("Workout History date range cannot exceed one year.");
  }
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    timezone,
  };
}
