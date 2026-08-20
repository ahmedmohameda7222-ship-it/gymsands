"use client";

import { useCallback } from "react";
import { useTranslation } from "./use-translation";

const en = {
  back: "Back to Exercise Library", backPlan: "Back to plan", backShort: "Back",
  overviewTitle: "Overview", anatomyTitle: "Anatomy & Target", techniqueTitle: "Technique & Setup", performanceTitle: "Performance", alternativesTitle: "Alternatives", detailsTitle: "Exercise Details",
  start: "Start Workout", addPlan: "Add to Plan", favorite: "Favorite", saved: "Saved", more: "More actions",
  target: "Target", primary: "Primary", secondary: "Secondary", stabilizers: "Stabilizers", focus: "Focus", muscleDetails: "View muscle details", fullAnatomy: "Full Anatomy",
  how: "How to Perform", guide: "Open exercise guide", techniqueSetup: "Technique & Setup", formSetup: "Form & Setup", setup: "Setup", techniqueCues: "Technique cues", commonMistakes: "Common mistakes", safety: "Safety",
  mySetupNote: "My Setup Note", setupNotePlaceholder: "Seat, pad, handle, pin or other setup details", setupNoteHint: "Private to your account. Saved automatically.", saving: "Saving…", saveFailed: "Failed", retry: "Try again",
  performance: "Your Performance", noPerformance: "No performance yet", unavailablePerformance: "Performance unavailable right now", lastPerformed: "Last performed", lastWorkout: "Last Workout", viewSession: "View Session", highestLoad: "Highest Load", estimatedOneRm: "Estimated 1RM", sameLoadMaxReps: "Same-load Max Reps", sessionVolume: "Session Volume", recentSessions: "Recent Sessions", personalBests: "Personal Bests", allSessions: "All Sessions", personalRecords: "Personal Records",
  details: "Details", classification: "Classification", movement: "Movement Pattern", mechanics: "Mechanics", force: "Force Type", difficulty: "Difficulty", activityType: "Activity Type", equipment: "Equipment", whatYouTrack: "What You Track", required: "Required", optional: "Optional",
  alternatives: "Alternatives", alternativesUnavailable: "Alternatives unavailable right now", allAlternatives: "View all alternatives", alternativeReason: "Why do you need an alternative?", unsupportedReason: "No authority-backed alternatives are available for this reason yet.", view: "View", replace: "Replace",
  reasonMachineTaken: "Machine taken", reasonEquipmentUnavailable: "Equipment unavailable", reasonTooHard: "Too hard", reasonWantHarder: "Want harder", reasonPain: "Pain / discomfort", reasonNoSpotter: "No spotter / support", reasonTechniqueConfidence: "Not confident with technique", reasonVariation: "Want variation",
  media: "Media", openVideo: "Open video", customVideo: "Custom video", addVideo: "Add custom video", changeVideo: "Change custom video", removeVideo: "Remove custom video", videoUrl: "Video URL", saveVideo: "Save video", invalidUrl: "Enter a valid http or https URL.", close: "Close",
  addTitle: "Add to workout plan", choosePlan: "Plan", chooseDay: "Day or session", createPlan: "Create workout plan", editPlan: "Edit plan", noPlans: "Create a workout plan before adding this exercise.", noDays: "This plan has no usable days yet.", prescription: "Planned prescription", confirmAdd: "Add exercise", adding: "Adding…", addFailed: "Exercise could not be added.", added: "Added to {plan} · {day}", already: "Already in {day}", viewDay: "View day", choose: "Choose", true: "Yes", false: "No",
  planSection: "In Your Plan", plan: "Plan", day: "Day", sets: "Sets", reps: "Repetitions", rest: "Rest", seconds: "{value} sec", note: "Plan note", libraryExercise: "View library exercise",
  coreFailed: "Exercise could not load", notFound: "Exercise not found", notFoundDescription: "This exercise is no longer available.", loading: "Loading exercise…", custom: "Custom exercise", unavailable: "Unavailable",
  videoSaved: "Custom video saved.", videoRemoved: "Custom video removed.", favoriteFailed: "Favorite could not be saved. Your previous state was restored."
} as const;
type Key = keyof typeof en;
type Dictionary = Record<Key, string>;

const de: Dictionary = {
  back: "Zurück zur Übungsbibliothek", backPlan: "Zurück zum Plan", backShort: "Zurück",
  overviewTitle: "Übersicht", anatomyTitle: "Anatomie & Ziel", techniqueTitle: "Technik & Einstellung", performanceTitle: "Leistung", alternativesTitle: "Alternativen", detailsTitle: "Übungsdetails",
  start: "Training starten", addPlan: "Zum Plan hinzufügen", favorite: "Favorit", saved: "Gespeichert", more: "Weitere Aktionen",
  target: "Ziel", primary: "Primär", secondary: "Sekundär", stabilizers: "Stabilisatoren", focus: "Fokus", muscleDetails: "Muskeldetails anzeigen", fullAnatomy: "Vollständige Anatomie",
  how: "Ausführung", guide: "Übungsanleitung öffnen", techniqueSetup: "Technik & Einstellung", formSetup: "Form & Einstellung", setup: "Einstellung", techniqueCues: "Technikhinweise", commonMistakes: "Häufige Fehler", safety: "Sicherheit",
  mySetupNote: "Meine Einstellungsnotiz", setupNotePlaceholder: "Sitz, Polster, Griff, Pin oder andere Einstellungen", setupNoteHint: "Privat in deinem Konto. Wird automatisch gespeichert.", saving: "Speichern…", saveFailed: "Fehlgeschlagen", retry: "Erneut versuchen",
  performance: "Deine Leistung", noPerformance: "Noch keine Leistung", unavailablePerformance: "Leistung ist gerade nicht verfügbar", lastPerformed: "Zuletzt ausgeführt", lastWorkout: "Letztes Training", viewSession: "Einheit anzeigen", highestLoad: "Höchste Last", estimatedOneRm: "Geschätztes 1RM", sameLoadMaxReps: "Max. Wdh. bei gleichem Gewicht", sessionVolume: "Einheitsvolumen", recentSessions: "Letzte Einheiten", personalBests: "Bestleistungen", allSessions: "Alle Einheiten", personalRecords: "Persönliche Rekorde",
  details: "Details", classification: "Klassifikation", movement: "Bewegungsmuster", mechanics: "Mechanik", force: "Kraftart", difficulty: "Schwierigkeit", activityType: "Aktivitätstyp", equipment: "Ausrüstung", whatYouTrack: "Was du erfasst", required: "Erforderlich", optional: "Optional",
  alternatives: "Alternativen", alternativesUnavailable: "Alternativen sind gerade nicht verfügbar", allAlternatives: "Alle Alternativen anzeigen", alternativeReason: "Warum brauchst du eine Alternative?", unsupportedReason: "Für diesen Grund sind noch keine autoritätsgestützten Alternativen verfügbar.", view: "Anzeigen", replace: "Ersetzen",
  reasonMachineTaken: "Gerät belegt", reasonEquipmentUnavailable: "Ausrüstung nicht verfügbar", reasonTooHard: "Zu schwer", reasonWantHarder: "Schwieriger gewünscht", reasonPain: "Schmerz / Beschwerden", reasonNoSpotter: "Keine Sicherung / Unterstützung", reasonTechniqueConfidence: "Unsicher bei der Technik", reasonVariation: "Variation gewünscht",
  media: "Medien", openVideo: "Video öffnen", customVideo: "Eigenes Video", addVideo: "Eigenes Video hinzufügen", changeVideo: "Eigenes Video ändern", removeVideo: "Eigenes Video entfernen", videoUrl: "Video-URL", saveVideo: "Video speichern", invalidUrl: "Gib eine gültige http- oder https-URL ein.", close: "Schließen",
  addTitle: "Zum Trainingsplan hinzufügen", choosePlan: "Plan", chooseDay: "Tag oder Einheit", createPlan: "Trainingsplan erstellen", editPlan: "Plan bearbeiten", noPlans: "Erstelle zuerst einen Trainingsplan.", noDays: "Dieser Plan hat noch keine nutzbaren Tage.", prescription: "Geplante Vorgaben", confirmAdd: "Übung hinzufügen", adding: "Wird hinzugefügt…", addFailed: "Übung konnte nicht hinzugefügt werden.", added: "Hinzugefügt zu {plan} · {day}", already: "Bereits in {day}", viewDay: "Tag anzeigen", choose: "Auswählen", true: "Ja", false: "Nein",
  planSection: "In deinem Plan", plan: "Plan", day: "Tag", sets: "Sätze", reps: "Wiederholungen", rest: "Pause", seconds: "{value} Sek.", note: "Plannotiz", libraryExercise: "Bibliotheksübung anzeigen",
  coreFailed: "Übung konnte nicht geladen werden", notFound: "Übung nicht gefunden", notFoundDescription: "Diese Übung ist nicht mehr verfügbar.", loading: "Übung wird geladen…", custom: "Eigene Übung", unavailable: "Nicht verfügbar",
  videoSaved: "Eigenes Video gespeichert.", videoRemoved: "Eigenes Video entfernt.", favoriteFailed: "Favorit konnte nicht gespeichert werden. Der vorherige Zustand wurde wiederhergestellt."
};

const ar: Dictionary = {
  back: "العودة إلى مكتبة التمارين", backPlan: "العودة إلى الخطة", backShort: "رجوع",
  overviewTitle: "نظرة عامة", anatomyTitle: "التشريح والعضلات المستهدفة", techniqueTitle: "الأسلوب والإعداد", performanceTitle: "الأداء", alternativesTitle: "البدائل", detailsTitle: "تفاصيل التمرين",
  start: "بدء التمرين", addPlan: "إضافة إلى الخطة", favorite: "المفضلة", saved: "محفوظ", more: "إجراءات إضافية",
  target: "الهدف", primary: "أساسي", secondary: "ثانوي", stabilizers: "عضلات التثبيت", focus: "التركيز", muscleDetails: "عرض تفاصيل العضلات", fullAnatomy: "التشريح الكامل",
  how: "طريقة الأداء", guide: "فتح دليل التمرين", techniqueSetup: "الأسلوب والإعداد", formSetup: "الشكل والإعداد", setup: "الإعداد", techniqueCues: "إرشادات الأداء", commonMistakes: "الأخطاء الشائعة", safety: "السلامة",
  mySetupNote: "ملاحظة الإعداد الخاصة بي", setupNotePlaceholder: "المقعد، الوسادة، المقبض، الدبوس أو تفاصيل إعداد أخرى", setupNoteHint: "خاصة بحسابك. تُحفظ تلقائيًا.", saving: "جارٍ الحفظ…", saveFailed: "فشل", retry: "إعادة المحاولة",
  performance: "أداؤك", noPerformance: "لا يوجد أداء بعد", unavailablePerformance: "الأداء غير متاح الآن", lastPerformed: "آخر أداء", lastWorkout: "آخر تمرين", viewSession: "عرض الجلسة", highestLoad: "أعلى حمل", estimatedOneRm: "الحد الأقصى التقديري", sameLoadMaxReps: "أقصى تكرارات بنفس الحمل", sessionVolume: "حجم الجلسة", recentSessions: "الجلسات الأخيرة", personalBests: "أفضل الأرقام", allSessions: "كل الجلسات", personalRecords: "الأرقام الشخصية",
  details: "التفاصيل", classification: "التصنيف", movement: "نمط الحركة", mechanics: "الميكانيكا", force: "نوع القوة", difficulty: "الصعوبة", activityType: "نوع النشاط", equipment: "المعدات", whatYouTrack: "ما يتم تسجيله", required: "مطلوب", optional: "اختياري",
  alternatives: "البدائل", alternativesUnavailable: "البدائل غير متاحة الآن", allAlternatives: "عرض كل البدائل", alternativeReason: "لماذا تحتاج إلى بديل؟", unsupportedReason: "لا توجد بدائل مدعومة بمرجعية موثوقة لهذا السبب حتى الآن.", view: "عرض", replace: "استبدال",
  reasonMachineTaken: "الجهاز مشغول", reasonEquipmentUnavailable: "المعدات غير متاحة", reasonTooHard: "صعب جدًا", reasonWantHarder: "أريد أصعب", reasonPain: "ألم / انزعاج", reasonNoSpotter: "لا يوجد مساعدة / دعم", reasonTechniqueConfidence: "غير واثق من الأسلوب", reasonVariation: "أريد تنويعًا",
  media: "الوسائط", openVideo: "فتح الفيديو", customVideo: "فيديو مخصص", addVideo: "إضافة فيديو مخصص", changeVideo: "تغيير الفيديو المخصص", removeVideo: "إزالة الفيديو المخصص", videoUrl: "رابط الفيديو", saveVideo: "حفظ الفيديو", invalidUrl: "أدخل رابط http أو https صالحًا.", close: "إغلاق",
  addTitle: "إضافة إلى خطة التمرين", choosePlan: "الخطة", chooseDay: "اليوم أو الجلسة", createPlan: "إنشاء خطة تمرين", editPlan: "تعديل الخطة", noPlans: "أنشئ خطة تمرين أولًا.", noDays: "لا تحتوي هذه الخطة على أيام قابلة للاستخدام بعد.", prescription: "الوصفة المخططة", confirmAdd: "إضافة التمرين", adding: "جارٍ الإضافة…", addFailed: "تعذرت إضافة التمرين.", added: "تمت الإضافة إلى {plan} · {day}", already: "موجود بالفعل في {day}", viewDay: "عرض اليوم", choose: "اختر", true: "نعم", false: "لا",
  planSection: "في خطتك", plan: "الخطة", day: "اليوم", sets: "المجموعات", reps: "التكرارات", rest: "الراحة", seconds: "{value} ث", note: "ملاحظة الخطة", libraryExercise: "عرض تمرين المكتبة",
  coreFailed: "تعذر تحميل التمرين", notFound: "التمرين غير موجود", notFoundDescription: "لم يعد هذا التمرين متاحًا.", loading: "جارٍ تحميل التمرين…", custom: "تمرين مخصص", unavailable: "غير متاح",
  videoSaved: "تم حفظ الفيديو المخصص.", videoRemoved: "تمت إزالة الفيديو المخصص.", favoriteFailed: "تعذر حفظ المفضلة. تمت استعادة الحالة السابقة."
};

const dictionaries = { en, de, ar } as const;
export function useExerciseDetailTranslation() {
  const { language, dir } = useTranslation();
  const locale = language === "de" ? "de-DE" : language === "ar" ? "ar-EG" : "en-GB";
  const ed = useCallback((key: Key, values?: Record<string, string | number>) => {
    const template = dictionaries[language][key];
    return values ? Object.entries(values).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), template) : template;
  }, [language]);
  return { language, dir, locale, ed };
}
