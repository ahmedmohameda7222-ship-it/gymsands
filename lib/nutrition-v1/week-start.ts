import { isIsoDate } from "@/lib/date-utils";

export type MealPlanWeekStartOverride = "locale" | 1 | 2 | 3 | 4 | 5 | 6 | 7;

type WeekInfoLike = { firstDay?: number };
type LocaleWithWeekInfo = Intl.Locale & {
  weekInfo?: WeekInfoLike;
  getWeekInfo?: () => WeekInfoLike;
};

const SUNDAY_FIRST_REGIONS = new Set(["US", "CA", "MX", "BR", "JP", "PH"]);
const SATURDAY_FIRST_REGIONS = new Set(["AE", "AF", "BH", "DJ", "DZ", "EG", "IQ", "IR", "JO", "KW", "LY", "OM", "QA", "SD", "SY"]);

export function localeWeekStartDay(locale: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  try {
    const resolved = new Intl.Locale(locale || "en-GB").maximize() as LocaleWithWeekInfo;
    const info = resolved.weekInfo ?? resolved.getWeekInfo?.();
    const firstDay = Number(info?.firstDay);
    if (Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7) {
      return firstDay as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    }
    const region = resolved.region ?? "";
    if (SUNDAY_FIRST_REGIONS.has(region)) return 7;
    if (SATURDAY_FIRST_REGIONS.has(region)) return 6;
  } catch {
    // Invalid or unsupported locale falls back to ISO Monday.
  }
  return 1;
}

export function startOfMealPlanWeek(date: string, firstDay: number) {
  if (!isIsoDate(date)) throw new Error("Meal Plan date must use YYYY-MM-DD.");
  const normalizedFirstDay = Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7 ? firstDay : 1;
  const value = new Date(`${date}T12:00:00Z`);
  const utcDay = value.getUTCDay();
  const isoDay = utcDay === 0 ? 7 : utcDay;
  const delta = (isoDay - normalizedFirstDay + 7) % 7;
  value.setUTCDate(value.getUTCDate() - delta);
  return value.toISOString().slice(0, 10);
}

export function weekContainsDate(weekStart: string, date: string) {
  if (!isIsoDate(weekStart) || !isIsoDate(date)) return false;
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const candidate = new Date(`${date}T12:00:00Z`);
  return candidate >= start && candidate <= end;
}

export function weekStartOverrideKey(ownerId: string) {
  return `plaivra:nutrition-v1:meal-plan:week-start:${ownerId}`;
}

export function parseMealPlanWeekStartOverride(value: string | null): MealPlanWeekStartOverride {
  if (!value || value === "locale") return "locale";
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 7
    ? numeric as 1 | 2 | 3 | 4 | 5 | 6 | 7
    : "locale";
}
