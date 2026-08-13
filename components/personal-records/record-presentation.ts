import type { CanonicalPersonalRecordEvent, PersonalRecordContextItem } from "@/lib/personal-records/contracts";
import type { PersonalRecordsTranslationKey } from "@/lib/i18n/personal-records";

type Translate = (key: PersonalRecordsTranslationKey, values?: Record<string, string | number>) => string;

export function formatRecordValue(event: Pick<CanonicalPersonalRecordEvent, "value" | "definition">, locale: string, translate: Translate) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(event.value);
  if (event.definition.canonicalUnit === "kg") return translate("kilograms", { value: number });
  if (event.definition.canonicalUnit === "repetitions") return translate("repetitions", { value: number });
  if (event.definition.canonicalUnit === "meters") return translate("meters", { value: number });
  if (event.definition.canonicalUnit === "kg_repetitions") return translate("volume", { value: number });
  if (event.definition.canonicalUnit === "seconds") {
    const minutes = Math.floor(event.value / 60);
    const seconds = Math.round(event.value % 60);
    return minutes ? translate("minutesSeconds", { minutes, seconds }) : translate("seconds", { value: number });
  }
  return translate("genericValue", { value: number });
}

export function formatRecordDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function contextLabel(item: PersonalRecordContextItem, locale: string, translate: Translate) {
  const label = item.key === "external_load_kg" || item.key === "load" ? translate("load")
    : item.key === "distance_meters" ? translate("distance")
      : item.key === "resistance" ? translate("resistance")
        : item.key === "side" ? translate("side")
          : item.key === "set" ? translate("set")
            : item.key.replaceAll("_", " ");
  const raw = typeof item.value === "number" ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.value) : String(item.value);
  const value = item.unit === "kg" ? `${raw} kg` : item.unit === "meters" ? `${raw} m` : item.unit === "seconds" ? `${raw} sec` : raw === "external" ? translate("external") : raw === "none" ? translate("none") : raw === "working" ? translate("working") : raw;
  return `${label}: ${value}`;
}

const definitionLabels = {
  en: { highest_load: "Highest load", same_load_max_repetitions: "Most repetitions", estimated_one_rep_max: "Estimated 1RM", exercise_session_volume: "Session volume", longest_duration: "Longest duration", longest_distance: "Longest distance", fastest_time: "Fastest time" },
  de: { highest_load: "Höchste Last", same_load_max_repetitions: "Meiste Wiederholungen", estimated_one_rep_max: "Geschätztes 1RM", exercise_session_volume: "Einheitsvolumen", longest_duration: "Längste Dauer", longest_distance: "Längste Distanz", fastest_time: "Schnellste Zeit" },
  ar: { highest_load: "أعلى حمل", same_load_max_repetitions: "أكبر عدد تكرارات", estimated_one_rep_max: "الحد الأقصى التقديري", exercise_session_volume: "حجم الجلسة", longest_duration: "أطول مدة", longest_distance: "أطول مسافة", fastest_time: "أسرع زمن" }
} as const;

export function recordDefinitionLabel(key: string, fallback: string, language: "en" | "de" | "ar") {
  return definitionLabels[language][key as keyof typeof definitionLabels.en] ?? fallback;
}
