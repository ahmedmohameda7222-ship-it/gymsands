import type { SupportedLanguage } from "@/lib/i18n/config";
import { getLocaleMetadata, isSupportedLanguage } from "@/lib/i18n/config";

export type ActiveWorkoutMeasurementUnit = "kg" | "reps" | "seconds" | "minutes";

export type ActiveWorkoutFormatters = {
  timer: (totalSeconds: number) => string;
  integer: (value: number) => string;
  decimal: (value: number, maximumFractionDigits?: number) => string;
  date: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  time: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  weekday: (value: Date | number | string) => string;
  list: (values: readonly string[], options?: Intl.ListFormatOptions) => string;
  measurement: (value: number, unit: ActiveWorkoutMeasurementUnit, maximumFractionDigits?: number) => string;
};

const measurementLabels: Record<"en" | "de" | "ar", Record<ActiveWorkoutMeasurementUnit, string>> = {
  en: { kg: "kg", reps: "reps", seconds: "sec", minutes: "min" },
  de: { kg: "kg", reps: "Wdh.", seconds: "Sek.", minutes: "Min." },
  ar: { kg: "kg", reps: "تكرارات", seconds: "ثانية", minutes: "دقيقة" }
};

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function safeDate(value: Date | number | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function languageFromIntlLocale(intlLocale: string): "en" | "de" | "ar" {
  const normalized = intlLocale.toLowerCase();
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ar")) return "ar";
  return "en";
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

export function createActiveWorkoutFormatters(localeOrIntlLocale: SupportedLanguage | string): ActiveWorkoutFormatters {
  const intlLocale = isSupportedLanguage(localeOrIntlLocale)
    ? getLocaleMetadata(localeOrIntlLocale).intlLocale
    : localeOrIntlLocale;
  const language = languageFromIntlLocale(intlLocale);
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
    measurement: (value, unit, maximumFractionDigits = 2) =>
      `${decimal(value, maximumFractionDigits)} ${measurementLabels[language][unit]}`
  };
}
