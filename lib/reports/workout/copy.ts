import { PdfReportError } from "@/lib/reports/pdf/errors";
import type { ReportLanguage } from "@/lib/reports/pdf/types";
import {
  workoutMetricLabel,
  workoutMetricSideLabel,
  workoutMetricUnitLabel,
  workoutSegmentLabel,
  workoutSetTypeLabel,
} from "@/lib/workouts/metric-presentation";
import type {
  WorkoutPerformanceCanonicalUnit,
  WorkoutPerformanceMetricKey,
  WorkoutPerformanceMetricSide,
} from "@/types/workout-performance";
import type {
  WorkoutSetSegmentKind,
  WorkoutSetSideMode,
  WorkoutSetType,
} from "@/types/workout-set-details";
import type { WorkoutPrescriptionSetTargetMode } from "@/types/workout-prescription";

export type WorkoutReportCopy = Readonly<{
  reportLabel: string;
  savedHistoryStatement: string;
  privateReminder: string;
  generated: string;
  page: string;
  of: string;
  summary: string;
  highlights: string;
  exercises: string;
  notes: string;
  unavailable: string;
  category: string;
  duration: string;
  minutes: string;
  exerciseCount: string;
  performedSets: string;
  plannedSets: string;
  completedPlanned: string;
  volume: string;
  volumeUnit: string;
  verifiedRecords: string;
  lifecycle: Record<"completed" | "partial" | "cancelled" | "skipped", string>;
  originalPlanned: string;
  state: string;
  set: string;
  setType: string;
  plannedTarget: string;
  actualResult: string;
  effort: string;
  verifiedRecord: string;
  missing: string;
  unplanned: string;
  replaced: string;
  continued: string;
  performed: string;
  planned: string;
  adjusted: string;
  repetitions: string;
  rest: string;
  seconds: string;
  tempo: string;
  highlightVerified: (count: number) => string;
  highlightCompleted: (performed: number, planned: number) => string;
  highlightReplaced: (count: number) => string;
}>;

const COPY: Record<ReportLanguage, WorkoutReportCopy> = {
  en: {
    reportLabel: "Workout report",
    savedHistoryStatement: "This report represents the saved Plaivra workout history.",
    privateReminder: "Private fitness data — handle and share carefully.",
    generated: "Generated",
    page: "Page",
    of: "of",
    summary: "Summary",
    highlights: "Highlights",
    exercises: "Exercises",
    notes: "Session notes",
    unavailable: "Unavailable",
    category: "Category",
    duration: "Duration",
    minutes: "min",
    exerciseCount: "Exercises",
    performedSets: "Performed sets",
    plannedSets: "Planned sets",
    completedPlanned: "Completed / planned",
    volume: "Reliable volume",
    volumeUnit: "kg × reps",
    verifiedRecords: "Verified records",
    lifecycle: { completed: "Completed", partial: "Partial", cancelled: "Cancelled", skipped: "Skipped" },
    originalPlanned: "Originally planned",
    state: "State",
    set: "Set",
    setType: "Type",
    plannedTarget: "Planned target",
    actualResult: "Actual result",
    effort: "RPE / RIR",
    verifiedRecord: "Verified record",
    missing: "Missing planned set",
    unplanned: "Unplanned performed set",
    replaced: "Replaced exercise",
    continued: "continued",
    performed: "Performed",
    planned: "Planned",
    adjusted: "Adjusted",
    repetitions: "reps",
    rest: "rest",
    seconds: "s",
    tempo: "tempo",
    highlightVerified: (count) => `${count} verified record${count === 1 ? "" : "s"}`,
    highlightCompleted: (performed, planned) => `${performed} of ${planned} planned sets performed`,
    highlightReplaced: (count) => `${count} replaced exercise${count === 1 ? "" : "s"}`,
  },
  de: {
    reportLabel: "Trainingsbericht",
    savedHistoryStatement: "Dieser Bericht bildet den gespeicherten Plaivra-Trainingsverlauf ab.",
    privateReminder: "Private Fitnessdaten — bitte sorgfältig behandeln und teilen.",
    generated: "Erstellt",
    page: "Seite",
    of: "von",
    summary: "Zusammenfassung",
    highlights: "Höhepunkte",
    exercises: "Übungen",
    notes: "Notizen zur Trainingseinheit",
    unavailable: "Nicht verfügbar",
    category: "Kategorie",
    duration: "Dauer",
    minutes: "Min.",
    exerciseCount: "Übungen",
    performedSets: "Ausgeführte Sätze",
    plannedSets: "Geplante Sätze",
    completedPlanned: "Ausgeführt / geplant",
    volume: "Verlässliches Volumen",
    volumeUnit: "kg × Wdh.",
    verifiedRecords: "Bestätigte Rekorde",
    lifecycle: { completed: "Abgeschlossen", partial: "Teilweise", cancelled: "Abgebrochen", skipped: "Übersprungen" },
    originalPlanned: "Ursprünglich geplant",
    state: "Status",
    set: "Satz",
    setType: "Satztyp",
    plannedTarget: "Geplantes Ziel",
    actualResult: "Tatsächliches Ergebnis",
    effort: "RPE / RIR",
    verifiedRecord: "Bestätigter Rekord",
    missing: "Fehlender geplanter Satz",
    unplanned: "Ungeplanter ausgeführter Satz",
    replaced: "Ersetzte Übung",
    continued: "Fortsetzung",
    performed: "Ausgeführt",
    planned: "Geplant",
    adjusted: "Angepasst",
    repetitions: "Wdh.",
    rest: "Pause",
    seconds: "s",
    tempo: "Tempo",
    highlightVerified: (count) => `${count} bestätigte${count === 1 ? "r Rekord" : " Rekorde"}`,
    highlightCompleted: (performed, planned) => `${performed} von ${planned} geplanten Sätzen ausgeführt`,
    highlightReplaced: (count) => `${count} ersetzte Übung${count === 1 ? "" : "en"}`,
  },
  ar: {
    reportLabel: "تقرير التمرين",
    savedHistoryStatement: "يمثل هذا التقرير سجل التمرين المحفوظ في Plaivra.",
    privateReminder: "بيانات لياقة خاصة — تعامل معها وشاركها بعناية.",
    generated: "تم الإنشاء",
    page: "صفحة",
    of: "من",
    summary: "الملخص",
    highlights: "أبرز النتائج",
    exercises: "التمارين",
    notes: "ملاحظات الجلسة",
    unavailable: "غير متاح",
    category: "الفئة",
    duration: "المدة",
    minutes: "دقيقة",
    exerciseCount: "التمارين",
    performedSets: "المجموعات المنفذة",
    plannedSets: "المجموعات المخططة",
    completedPlanned: "المنفذ / المخطط",
    volume: "الحجم الموثوق",
    volumeUnit: "كجم × تكرارات",
    verifiedRecords: "الأرقام القياسية الموثقة",
    lifecycle: { completed: "مكتمل", partial: "جزئي", cancelled: "ملغي", skipped: "تم التخطي" },
    originalPlanned: "المخطط الأصلي",
    state: "الحالة",
    set: "المجموعة",
    setType: "النوع",
    plannedTarget: "الهدف المخطط",
    actualResult: "النتيجة الفعلية",
    effort: "RPE / RIR",
    verifiedRecord: "رقم قياسي موثق",
    missing: "مجموعة مخططة مفقودة",
    unplanned: "مجموعة منفذة غير مخططة",
    replaced: "تمرين مستبدل",
    continued: "متابعة",
    performed: "منفذة",
    planned: "مخطط",
    adjusted: "معدّل",
    repetitions: "تكرارات",
    rest: "راحة",
    seconds: "ث",
    tempo: "الإيقاع",
    highlightVerified: (count) => `${count} رقم قياسي موثق`,
    highlightCompleted: (performed, planned) => `تم تنفيذ ${performed} من ${planned} مجموعة مخططة`,
    highlightReplaced: (count) => `${count} تمرين مستبدل`,
  },
};


export const WORKOUT_REPORT_CANONICAL_CATEGORIES = [
  "strength",
  "cardio",
  "mobility",
  "conditioning",
  "endurance",
  "flexibility",
  "recovery",
  "sports",
  "hiit",
  "circuit",
  "mixed",
  "other",
] as const;

export type WorkoutReportCanonicalCategory =
  (typeof WORKOUT_REPORT_CANONICAL_CATEGORIES)[number];

const CATEGORY_COPY = {
  en: {
    strength: "Strength",
    cardio: "Cardio",
    mobility: "Mobility",
    conditioning: "Conditioning",
    endurance: "Endurance",
    flexibility: "Flexibility",
    recovery: "Recovery",
    sports: "Sports",
    hiit: "HIIT",
    circuit: "Circuit",
    mixed: "Mixed",
    other: "Other",
  },
  de: {
    strength: "Kraft",
    cardio: "Cardio",
    mobility: "Mobilität",
    conditioning: "Kondition",
    endurance: "Ausdauer",
    flexibility: "Beweglichkeit",
    recovery: "Regeneration",
    sports: "Sport",
    hiit: "HIIT",
    circuit: "Zirkel",
    mixed: "Gemischt",
    other: "Sonstiges",
  },
  ar: {
    strength: "القوة",
    cardio: "تمارين القلب",
    mobility: "الحركة",
    conditioning: "اللياقة البدنية",
    endurance: "التحمل",
    flexibility: "المرونة",
    recovery: "التعافي",
    sports: "الرياضة",
    hiit: "تمارين HIIT",
    circuit: "تمرين دائري",
    mixed: "مختلط",
    other: "أخرى",
  },
} satisfies Record<
  ReportLanguage,
  Record<WorkoutReportCanonicalCategory, string>
>;

const SET_TYPE_COPY = {
  en: {
    warmup: "Warm-up",
    working: "Working set",
    normal: "Normal set",
    failure: "To failure",
    drop: "Drop set",
    backoff: "Back-off set",
    amrap: "AMRAP",
    timed: "Timed set",
    other: "Other set",
  },
  de: {
    warmup: "Aufwärmsatz",
    working: "Arbeitssatz",
    normal: "Normaler Satz",
    failure: "Bis zum Muskelversagen",
    drop: "Dropsatz",
    backoff: "Back-off-Satz",
    amrap: "AMRAP",
    timed: "Zeitsatz",
    other: "Anderer Satz",
  },
  ar: {
    warmup: "مجموعة إحماء",
    working: "مجموعة عمل",
    normal: "مجموعة عادية",
    failure: "حتى الفشل",
    drop: "مجموعة إسقاط",
    backoff: "مجموعة تخفيف",
    amrap: "AMRAP",
    timed: "مجموعة زمنية",
    other: "مجموعة أخرى",
  },
} satisfies Record<ReportLanguage, Record<WorkoutSetType, string>>;

const METRIC_COPY = {
  en: {
    repetitions: "Repetitions",
    external_load_kg: "External load",
    bodyweight_kg: "Bodyweight",
    assistance_load_kg: "Assistance",
    duration_seconds: "Duration",
    distance_meters: "Distance",
    rounds: "Rounds",
  },
  de: {
    repetitions: "Wiederholungen",
    external_load_kg: "Zusatzgewicht",
    bodyweight_kg: "Körpergewicht",
    assistance_load_kg: "Unterstützung",
    duration_seconds: "Dauer",
    distance_meters: "Distanz",
    rounds: "Runden",
  },
  ar: {
    repetitions: "التكرارات",
    external_load_kg: "الحمل الخارجي",
    bodyweight_kg: "وزن الجسم",
    assistance_load_kg: "حمل المساعدة",
    duration_seconds: "المدة",
    distance_meters: "المسافة",
    rounds: "الجولات",
  },
} satisfies Record<
  ReportLanguage,
  Record<WorkoutPerformanceMetricKey, string>
>;

const SIDE_COPY = {
  en: {
    none: "",
    bilateral: "Bilateral",
    left: "Left",
    right: "Right",
    alternating: "Alternating",
  },
  de: {
    none: "",
    bilateral: "Beidseitig",
    left: "Links",
    right: "Rechts",
    alternating: "Abwechselnd",
  },
  ar: {
    none: "",
    bilateral: "ثنائي الجانب",
    left: "يسار",
    right: "يمين",
    alternating: "بالتناوب",
  },
} satisfies Record<ReportLanguage, Record<WorkoutSetSideMode, string>>;

const SEGMENT_KIND_COPY = {
  en: {
    primary: "Primary",
    drop: "Drop",
    rest_pause: "Rest-pause",
    other: "Other segment",
  },
  de: {
    primary: "Hauptsegment",
    drop: "Drop-Segment",
    rest_pause: "Rest-Pause",
    other: "Anderes Segment",
  },
  ar: {
    primary: "الجزء الأساسي",
    drop: "جزء الإسقاط",
    rest_pause: "راحة وتوقف",
    other: "جزء آخر",
  },
} satisfies Record<ReportLanguage, Record<WorkoutSetSegmentKind, string>>;

const TARGET_MODE_COPY = {
  en: {
    exact: "Exact target",
    range: "Target range",
    minimum: "Minimum target",
    maximum: "Maximum target",
    amrap: "AMRAP target",
    timed: "Timed target",
    distance: "Distance target",
    rounds: "Rounds target",
    mixed: "Mixed target",
    custom: "Custom target",
  },
  de: {
    exact: "Genaues Ziel",
    range: "Zielbereich",
    minimum: "Mindestziel",
    maximum: "Höchstziel",
    amrap: "AMRAP-Ziel",
    timed: "Zeitziel",
    distance: "Distanzziel",
    rounds: "Rundenziel",
    mixed: "Gemischtes Ziel",
    custom: "Individuelles Ziel",
  },
  ar: {
    exact: "هدف محدد",
    range: "نطاق الهدف",
    minimum: "الحد الأدنى للهدف",
    maximum: "الحد الأقصى للهدف",
    amrap: "هدف AMRAP",
    timed: "هدف زمني",
    distance: "هدف المسافة",
    rounds: "هدف الجولات",
    mixed: "هدف مختلط",
    custom: "هدف مخصص",
  },
} satisfies Record<
  ReportLanguage,
  Record<WorkoutPrescriptionSetTargetMode, string>
>;

const UNIT_COPY = {
  en: { count: "", kg: "kg", seconds: "s", meters: "m" },
  de: { count: "", kg: "kg", seconds: "s", meters: "m" },
  ar: { count: "", kg: "كجم", seconds: "ث", meters: "م" },
} satisfies Record<
  ReportLanguage,
  Record<WorkoutPerformanceCanonicalUnit, string>
>;

function unsupportedSemantic(): never {
  throw new PdfReportError(
    "REPORT_GENERATION_FAILED",
    "The report contains an unsupported canonical semantic value.",
    422,
  );
}

function isOneOf<const Values extends readonly string[]>(
  value: string,
  values: Values,
): value is Values[number] {
  return values.includes(value as Values[number]);
}

const SET_TYPES = Object.freeze(Object.keys(SET_TYPE_COPY.en) as WorkoutSetType[]);
const METRIC_KEYS = Object.freeze(
  Object.keys(METRIC_COPY.en) as WorkoutPerformanceMetricKey[],
);
const SIDES = Object.freeze(Object.keys(SIDE_COPY.en) as WorkoutSetSideMode[]);
const SEGMENT_KINDS = Object.freeze(
  Object.keys(SEGMENT_KIND_COPY.en) as WorkoutSetSegmentKind[],
);
const TARGET_MODES = Object.freeze(
  Object.keys(TARGET_MODE_COPY.en) as WorkoutPrescriptionSetTargetMode[],
);
const UNITS = Object.freeze(
  Object.keys(UNIT_COPY.en) as WorkoutPerformanceCanonicalUnit[],
);

export function formatWorkoutReportCategory(
  value: string,
  language: ReportLanguage,
): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase().replaceAll("-", "_");
  if (isOneOf(normalized, WORKOUT_REPORT_CANONICAL_CATEGORIES)) {
    return CATEGORY_COPY[language][normalized];
  }
  // The canonical Workout History contract permits saved free-text categories.
  // Preserve authored labels, but reject unknown machine-token values so a new
  // internal enum cannot silently leak into localized report copy.
  if (/^[a-z][a-z0-9_-]*$/u.test(trimmed)) unsupportedSemantic();
  return trimmed;
}

export function formatWorkoutReportSetType(
  value: string,
  language: ReportLanguage,
): string {
  if (!isOneOf(value, SET_TYPES)) unsupportedSemantic();
  return workoutSetTypeLabel(value, language, "report") ?? unsupportedSemantic();
}

export function formatWorkoutReportMetricLabel(
  value: string,
  language: ReportLanguage,
): string {
  if (!isOneOf(value, METRIC_KEYS)) unsupportedSemantic();
  return workoutMetricLabel(value, language, "report") ?? unsupportedSemantic();
}

export function formatWorkoutReportSide(
  value: string,
  language: ReportLanguage,
): string | null {
  if (!isOneOf(value, SIDES)) unsupportedSemantic();
  return workoutMetricSideLabel(value, language, "report");
}

export function formatWorkoutReportSegmentKind(
  value: string,
  language: ReportLanguage,
): string {
  if (!isOneOf(value, SEGMENT_KINDS)) unsupportedSemantic();
  return workoutSegmentLabel(value, language, "report") ?? unsupportedSemantic();
}

export function formatWorkoutReportTargetMode(
  value: string,
  language: ReportLanguage,
): string {
  if (!isOneOf(value, TARGET_MODES)) unsupportedSemantic();
  return TARGET_MODE_COPY[language][value];
}

export function formatWorkoutReportUnit(
  value: string,
  language: ReportLanguage,
): string {
  if (!isOneOf(value, UNITS)) unsupportedSemantic();
  return workoutMetricUnitLabel(value, language);
}

export function assertWorkoutReportMetricSide(
  value: string,
): WorkoutPerformanceMetricSide {
  if (!isOneOf(value, ["none", "bilateral", "left", "right"] as const)) {
    unsupportedSemantic();
  }
  return value;
}

export function workoutReportCopy(language: ReportLanguage): WorkoutReportCopy {
  return COPY[language];
}

export const WORKOUT_REPORT_UI_COPY: Record<ReportLanguage, Readonly<{
  download: string;
  preparing: string;
  failedTitle: string;
  failedDescription: string;
}>> = {
  en: { download: "Download PDF", preparing: "Preparing PDF", failedTitle: "Could not prepare PDF", failedDescription: "Please try again." },
  de: { download: "PDF herunterladen", preparing: "PDF wird erstellt", failedTitle: "PDF konnte nicht erstellt werden", failedDescription: "Bitte versuche es erneut." },
  ar: { download: "تنزيل PDF", preparing: "جارٍ إعداد PDF", failedTitle: "تعذر إعداد ملف PDF", failedDescription: "حاول مرة أخرى." },
};
