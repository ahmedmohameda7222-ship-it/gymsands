export type WorkoutHistoryDateRange = {
  from: string;
  to: string;
  timezone: string;
};

type LocalDateTime = {
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

function timeZoneParts(date: Date, timezone: string) {
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
  const parts = timeZoneParts(date, timezone);
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
  const current = timeZoneParts(now, timezone);
  const nextMonth = current.month === 12
    ? { year: current.year + 1, month: 1 }
    : { year: current.year, month: current.month + 1 };
  return {
    from: zonedLocalDateTimeToIso({ year: current.year, month: current.month, day: 1 }, timezone),
    to: zonedLocalDateTimeToIso({ ...nextMonth, day: 1 }, timezone),
    timezone,
  };
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
