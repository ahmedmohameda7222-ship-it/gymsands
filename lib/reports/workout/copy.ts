import type { ReportLanguage } from "@/lib/reports/pdf/types";

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
