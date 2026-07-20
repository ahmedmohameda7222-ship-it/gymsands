import type { SupportedLanguage } from "@/lib/i18n/config";
import { getLocaleMetadata, isSupportedLanguage } from "@/lib/i18n/config";

export type ActiveWorkoutBaseFormatters = {
  timer: (totalSeconds: number) => string;
  integer: (value: number) => string;
  decimal: (value: number, maximumFractionDigits?: number) => string;
  ratio: (current: number, total: number) => string;
  date: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  time: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  weekday: (value: Date | number | string) => string;
  list: (values: readonly string[], options?: Intl.ListFormatOptions) => string;
  measurement: (value: number, localizedUnitLabel: string, maximumFractionDigits?: number) => string;
};

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function safeDate(value: Date | number | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

export function formatActiveWorkoutTimer(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(safeNumber(totalSeconds)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function createActiveWorkoutFormatters(localeOrIntlLocale: SupportedLanguage | string): ActiveWorkoutBaseFormatters {
  const intlLocale = isSupportedLanguage(localeOrIntlLocale)
    ? getLocaleMetadata(localeOrIntlLocale).intlLocale
    : localeOrIntlLocale;
  const integerFormatter = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 0
  });

  const integer = (value: number) => integerFormatter.format(Math.trunc(safeNumber(value)));
  const decimal = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.max(0, Math.min(10, Math.trunc(maximumFractionDigits)))
    }).format(safeNumber(value));

  return {
    timer: formatActiveWorkoutTimer,
    integer,
    decimal,
    ratio: (current, total) => `${integer(current)}/${integer(total)}`,
    date: (value, options = {}) => {
      const hasExplicitDateFields = Boolean(
        options.dateStyle ||
        options.year ||
        options.month ||
        options.day ||
        options.weekday
      );
      return new Intl.DateTimeFormat(intlLocale, {
        ...(hasExplicitDateFields ? {} : { dateStyle: "medium" as const }),
        ...options,
        timeZone: options.timeZone ?? "UTC"
      }).format(safeDate(value));
    },
    time: (value, options = {}) => {
      const hasExplicitTimeFields = Boolean(
        options.timeStyle ||
        options.hour ||
        options.minute ||
        options.second
      );
      return new Intl.DateTimeFormat(intlLocale, {
        ...(hasExplicitTimeFields ? {} : { hour: "2-digit" as const, minute: "2-digit" as const }),
        ...options,
        timeZone: options.timeZone ?? "UTC"
      }).format(safeDate(value));
    },
    weekday: (value) =>
      new Intl.DateTimeFormat(intlLocale, {
        weekday: "long",
        timeZone: "UTC"
      }).format(safeDate(value)),
    list: (values, options = {}) =>
      new Intl.ListFormat(intlLocale, {
        style: "long",
        type: "conjunction",
        ...options
      }).format(values),
    measurement: (value, localizedUnitLabel, maximumFractionDigits = 2) =>
      `${decimal(value, maximumFractionDigits)} ${localizedUnitLabel}`
  };
}
