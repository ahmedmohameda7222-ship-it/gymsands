import type { PersonalRecordSessionEvent } from "@/lib/personal-records/contracts";
import type {
  WorkoutHistoryMetricValue,
  WorkoutHistoryPlannedMetricTarget,
} from "@/types/workout-history";

export type WorkoutMetricLanguage = "en" | "de" | "ar";

const COPY = {
  en: {
    metrics: { repetitions: "Repetitions", external_load_kg: "Load", bodyweight_kg: "Body weight", assistance_load_kg: "Assistance", duration_seconds: "Duration", distance_meters: "Distance", rounds: "Rounds" },
    units: { kg: "kg", repetitions: "reps", rounds: "rounds", meters: "m", kilometers: "km", seconds: "sec" },
    sides: { bilateral: "Both sides", left: "Left", right: "Right" },
    setTypes: { warmup: "Warm-up", working: "Working set", normal: "Normal set", failure: "To failure", drop: "Drop set", backoff: "Back-off set", amrap: "AMRAP", timed: "Timed", other: "Other" },
    segments: { primary: "Primary effort", drop: "Drop", rest_pause: "Rest-pause", other: "Additional effort" },
    records: { highest_load: "Highest load", same_load_max_repetitions: "Most repetitions", estimated_one_rep_max: "Estimated 1RM", exercise_session_volume: "Session volume", longest_duration: "Longest duration", longest_distance: "Longest distance", fastest_time: "Fastest time" },
    personalRecord: "Personal record",
  },
  de: {
    metrics: { repetitions: "Wiederholungen", external_load_kg: "Last", bodyweight_kg: "Körpergewicht", assistance_load_kg: "Unterstützung", duration_seconds: "Dauer", distance_meters: "Distanz", rounds: "Runden" },
    units: { kg: "kg", repetitions: "Wdh.", rounds: "Runden", meters: "m", kilometers: "km", seconds: "Sek." },
    sides: { bilateral: "Beide Seiten", left: "Links", right: "Rechts" },
    setTypes: { warmup: "Aufwärmen", working: "Arbeitssatz", normal: "Normaler Satz", failure: "Bis zum Versagen", drop: "Dropsatz", backoff: "Back-off-Satz", amrap: "AMRAP", timed: "Auf Zeit", other: "Sonstiger Satz" },
    segments: { primary: "Hauptbelastung", drop: "Reduzierung", rest_pause: "Pause-Wiederholung", other: "Zusätzliche Belastung" },
    records: { highest_load: "Höchste Last", same_load_max_repetitions: "Meiste Wiederholungen", estimated_one_rep_max: "Geschätztes 1RM", exercise_session_volume: "Einheitsvolumen", longest_duration: "Längste Dauer", longest_distance: "Längste Distanz", fastest_time: "Schnellste Zeit" },
    personalRecord: "Persönlicher Rekord",
  },
  ar: {
    metrics: { repetitions: "التكرارات", external_load_kg: "الحمل", bodyweight_kg: "وزن الجسم", assistance_load_kg: "المساعدة", duration_seconds: "المدة", distance_meters: "المسافة", rounds: "الجولات" },
    units: { kg: "كجم", repetitions: "تكرار", rounds: "جولة", meters: "م", kilometers: "كم", seconds: "ث" },
    sides: { bilateral: "الجانبان", left: "اليسار", right: "اليمين" },
    setTypes: { warmup: "إحماء", working: "مجموعة عمل", normal: "مجموعة عادية", failure: "حتى الفشل", drop: "مجموعة إسقاط", backoff: "مجموعة تخفيف", amrap: "أقصى تكرارات", timed: "موقّتة", other: "مجموعة أخرى" },
    segments: { primary: "الجهد الرئيسي", drop: "إسقاط", rest_pause: "راحة قصيرة", other: "جهد إضافي" },
    records: { highest_load: "أعلى حمل", same_load_max_repetitions: "أكبر عدد تكرارات", estimated_one_rep_max: "الحد الأقصى التقديري", exercise_session_volume: "حجم الجلسة", longest_duration: "أطول مدة", longest_distance: "أطول مسافة", fastest_time: "أسرع زمن" },
    personalRecord: "رقم قياسي شخصي",
  },
} as const;

const REPORT_COPY = {
  en: {
    metrics: { external_load_kg: "External load", bodyweight_kg: "Bodyweight" },
    sides: { bilateral: "Bilateral", left: "Left", right: "Right" },
    setTypes: { warmup: "Warm-up", working: "Working set", normal: "Normal set", failure: "To failure", drop: "Drop set", backoff: "Back-off set", amrap: "AMRAP", timed: "Timed set", other: "Other set" },
    segments: { primary: "Primary", drop: "Drop", rest_pause: "Rest-pause", other: "Other segment" },
  },
  de: {
    metrics: { external_load_kg: "Zusatzgewicht", bodyweight_kg: "Körpergewicht", assistance_load_kg: "Unterstützung" },
    sides: { bilateral: "Beidseitig", left: "Links", right: "Rechts" },
    setTypes: { warmup: "Aufwärmsatz", working: "Arbeitssatz", normal: "Normaler Satz", failure: "Bis zum Muskelversagen", drop: "Dropsatz", backoff: "Back-off-Satz", amrap: "AMRAP", timed: "Zeitsatz", other: "Anderer Satz" },
    segments: { primary: "Hauptsegment", drop: "Drop-Segment", rest_pause: "Rest-Pause", other: "Anderes Segment" },
  },
  ar: {
    metrics: { external_load_kg: "الحمل الخارجي", bodyweight_kg: "وزن الجسم", assistance_load_kg: "حمل المساعدة" },
    sides: { bilateral: "ثنائي الجانب", left: "يسار", right: "يمين" },
    setTypes: { warmup: "مجموعة إحماء", working: "مجموعة عمل", normal: "مجموعة عادية", failure: "حتى الفشل", drop: "مجموعة إسقاط", backoff: "مجموعة تخفيف", amrap: "AMRAP", timed: "مجموعة زمنية", other: "مجموعة أخرى" },
    segments: { primary: "الجزء الأساسي", drop: "جزء الإسقاط", rest_pause: "راحة وتوقف", other: "جزء آخر" },
  },
} as const;

function language(locale: string): WorkoutMetricLanguage {
  return locale.startsWith("de") ? "de" : locale.startsWith("ar") ? "ar" : "en";
}

function number(value: number, locale: string, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function workoutMetricLabel(metricKey: string, locale: string, surface: "ui" | "report" = "ui"): string | null {
  const lang = language(locale);
  const copy = COPY[language(locale)].metrics;
  if (surface === "report") {
    const report = REPORT_COPY[lang].metrics as Partial<Record<string, string>>;
    if (report[metricKey]) return report[metricKey] ?? null;
  }
  return copy[metricKey as keyof typeof copy] ?? null;
}

export function workoutMetricUnitLabel(unit: "count" | "kg" | "seconds" | "meters", locale: string): string {
  if (unit === "count") return "";
  const units = COPY[language(locale)].units;
  return unit === "kg" ? units.kg : unit === "seconds" ? units.seconds : units.meters;
}

export function workoutMetricSideLabel(side: string, locale: string, surface: "ui" | "report" = "ui"): string | null {
  if (side === "none") return null;
  const lang = language(locale);
  const sides = surface === "report" ? REPORT_COPY[lang].sides : COPY[lang].sides;
  return sides[side as keyof typeof sides] ?? null;
}

export function formatWorkoutMetricValue(metricKey: string, value: number, locale: string): string | null {
  const copy = COPY[language(locale)];
  if (!Number.isFinite(value)) return null;
  if (metricKey === "duration_seconds") {
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60);
    return minutes ? `${number(minutes, locale, 0)} min${seconds ? ` ${number(seconds, locale, 0)} ${copy.units.seconds}` : ""}` : `${number(seconds, locale, 0)} ${copy.units.seconds}`;
  }
  if (metricKey === "distance_meters") return value >= 1000
    ? `${number(value / 1000, locale, 2)} ${copy.units.kilometers}`
    : `${number(value, locale, 0)} ${copy.units.meters}`;
  if (["external_load_kg", "bodyweight_kg", "assistance_load_kg"].includes(metricKey)) return `${number(value, locale)} ${copy.units.kg}`;
  if (metricKey === "repetitions") return `${number(value, locale, 0)} ${copy.units.repetitions}`;
  if (metricKey === "rounds") return `${number(value, locale, 0)} ${copy.units.rounds}`;
  return null;
}

export function presentWorkoutMetric(metric: WorkoutHistoryMetricValue, locale: string) {
  const label = workoutMetricLabel(metric.metricKey, locale);
  const value = formatWorkoutMetricValue(metric.metricKey, metric.value, locale);
  if (!label || !value) return null;
  const side = workoutMetricSideLabel(metric.side, locale);
  return { label: side ? `${label} / ${side}` : label, value };
}

export function presentWorkoutTarget(target: WorkoutHistoryPlannedMetricTarget, locale: string) {
  const label = workoutMetricLabel(target.metricKey, locale);
  if (!label) return null;
  const format = (value: number | null) => value === null ? null : formatWorkoutMetricValue(target.metricKey, value, locale);
  const exact = format(target.targetValue);
  const minimum = format(target.minimumValue);
  const maximum = format(target.maximumValue);
  const value = target.targetMode === "range" && minimum && maximum ? `${minimum}–${maximum}`
    : exact ?? (minimum ? `≥ ${minimum}` : maximum ? `≤ ${maximum}` : null);
  return value ? { label, value } : null;
}

export function workoutSetTypeLabel(value: string | null, locale: string, surface: "ui" | "report" = "ui"): string | null {
  if (!value) return null;
  const lang = language(locale);
  const copy = surface === "report" ? REPORT_COPY[lang].setTypes : COPY[lang].setTypes;
  return copy[value as keyof typeof copy] ?? null;
}

export function workoutSegmentLabel(value: string, locale: string, surface: "ui" | "report" = "ui"): string | null {
  const lang = language(locale);
  const copy = surface === "report" ? REPORT_COPY[lang].segments : COPY[lang].segments;
  return copy[value as keyof typeof copy] ?? null;
}

export function presentWorkoutPersonalRecord(record: PersonalRecordSessionEvent, locale: string): { label: string; value: string; previous: string | null } {
  const copy = COPY[language(locale)];
  const key = record.event.definition.key as keyof typeof copy.records;
  const value = record.event.definition.canonicalUnit === "kg_repetitions"
    ? `${number(record.event.value, locale, 2)} ${copy.units.kg} × ${copy.units.repetitions}`
    : formatWorkoutMetricValue(
      record.event.definition.canonicalUnit === "kg" ? "external_load_kg" :
        record.event.definition.canonicalUnit === "repetitions" ? "repetitions" :
          record.event.definition.canonicalUnit === "seconds" ? "duration_seconds" :
            record.event.definition.canonicalUnit === "meters" ? "distance_meters" : "",
      record.event.value,
      locale,
    ) ?? number(record.event.value, locale, 2);
  const previous: string | null = record.previousComparable ? presentWorkoutPersonalRecord({ event: record.previousComparable, previousComparable: null }, locale).value : null;
  return { label: copy.records[key] ?? copy.personalRecord, value, previous };
}
