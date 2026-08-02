import type { SupportedLanguage } from "@/lib/i18n/config";

export type WorkoutHistoryCorrectionCopy = {
  performedSets: string;
  editSet: string;
  addSet: string;
  removeSet: string;
  undoRemove: string;
  repetitions: string;
  loadKg: string;
  setType: string;
  rpe: string;
  rir: string;
  setNote: string;
  changedSets: (count: number) => string;
  noSetChanges: string;
  invalidNumber: string;
  invalidRpe: string;
  invalidRir: string;
  reloadLatest: string;
  revisionConflict: string;
  projectionPending: string;
};

const copy: Record<SupportedLanguage, WorkoutHistoryCorrectionCopy> = {
  en: {
    performedSets: "Performed sets",
    editSet: "Edit set",
    addSet: "Add set",
    removeSet: "Remove set",
    undoRemove: "Undo removal",
    repetitions: "Repetitions",
    loadKg: "Load (kg)",
    setType: "Set type",
    rpe: "RPE",
    rir: "RIR",
    setNote: "Set note",
    changedSets: (count) => `${count} set change${count === 1 ? "" : "s"}`,
    noSetChanges: "No performed-set changes.",
    invalidNumber: "Use a non-negative number.",
    invalidRpe: "RPE must be empty or between 0 and 10.",
    invalidRir: "RIR must be empty or between 0 and 20.",
    reloadLatest: "Reload latest workout",
    revisionConflict: "This workout changed on another device. Reload the latest version before saving.",
    projectionPending: "The correction was saved. Progress records are being rebuilt and may appear shortly.",
  },
  de: {
    performedSets: "Ausgeführte Sätze",
    editSet: "Satz bearbeiten",
    addSet: "Satz hinzufügen",
    removeSet: "Satz entfernen",
    undoRemove: "Entfernen rückgängig machen",
    repetitions: "Wiederholungen",
    loadKg: "Gewicht (kg)",
    setType: "Satzart",
    rpe: "RPE",
    rir: "RIR",
    setNote: "Satznotiz",
    changedSets: (count) => `${count} Satzänderung${count === 1 ? "" : "en"}`,
    noSetChanges: "Keine Änderungen an ausgeführten Sätzen.",
    invalidNumber: "Bitte eine nicht negative Zahl eingeben.",
    invalidRpe: "RPE muss leer oder zwischen 0 und 10 sein.",
    invalidRir: "RIR muss leer oder zwischen 0 und 20 sein.",
    reloadLatest: "Aktuellen Stand laden",
    revisionConflict: "Dieses Training wurde auf einem anderen Gerät geändert. Bitte zuerst den aktuellen Stand laden.",
    projectionPending: "Die Korrektur wurde gespeichert. Fortschrittsdaten werden neu berechnet und können kurz später erscheinen.",
  },
  ar: {
    performedSets: "المجموعات المنفذة",
    editSet: "تعديل المجموعة",
    addSet: "إضافة مجموعة",
    removeSet: "حذف المجموعة",
    undoRemove: "التراجع عن الحذف",
    repetitions: "التكرارات",
    loadKg: "الوزن (كجم)",
    setType: "نوع المجموعة",
    rpe: "RPE",
    rir: "RIR",
    setNote: "ملاحظة المجموعة",
    changedSets: (count) => `${count} تغييرات في المجموعات`,
    noSetChanges: "لا توجد تغييرات في المجموعات المنفذة.",
    invalidNumber: "استخدم رقمًا غير سالب.",
    invalidRpe: "يجب أن تكون قيمة RPE فارغة أو بين 0 و10.",
    invalidRir: "يجب أن تكون قيمة RIR فارغة أو بين 0 و20.",
    reloadLatest: "تحميل أحدث نسخة",
    revisionConflict: "تم تعديل هذا التمرين على جهاز آخر. حمّل أحدث نسخة قبل الحفظ.",
    projectionPending: "تم حفظ التصحيح. تتم الآن إعادة حساب بيانات التقدم وقد تظهر بعد قليل.",
  },
};

export function getWorkoutHistoryCorrectionCopy(
  language: SupportedLanguage,
): WorkoutHistoryCorrectionCopy {
  return copy[language];
}
