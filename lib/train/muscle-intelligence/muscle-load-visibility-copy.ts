import type { SupportedLanguage } from "@/lib/i18n/types";

const copy = {
  en: {
    cardTitle: "Muscle Load",
    cardDescription: "Open the full front and back muscle map for your active plan.",
    cardAction: "Open muscle load",
    pageTitle: "Muscle Load",
    pageDescription: "Review how your active plan distributes prescribed sets across the body.",
    panelTitle: "Active Plan Muscle Load",
    panelDescription: "Estimated from the prescribed sets in your active workout plan.",
    backToTrain: "Back to Train",
    loading: "Loading your active plan…",
    loadFailedTitle: "Muscle load could not load",
    loadFailedDescription: "Your workout plans are still available. Try opening muscle load again.",
    noPlanTitle: "No active plan",
    noPlanDescription: "Choose an active workout plan before reviewing muscle load.",
    viewPlans: "View workout plans"
  },
  de: {
    cardTitle: "Muskelbelastung",
    cardDescription: "Öffne die vollständige Vorder- und Rückansicht für deinen aktiven Plan.",
    cardAction: "Muskelbelastung öffnen",
    pageTitle: "Muskelbelastung",
    pageDescription: "Prüfe, wie dein aktiver Plan die vorgegebenen Sätze auf den Körper verteilt.",
    panelTitle: "Muskelbelastung des aktiven Plans",
    panelDescription: "Geschätzt anhand der vorgegebenen Sätze in deinem aktiven Trainingsplan.",
    backToTrain: "Zurück zu Training",
    loading: "Aktiver Plan wird geladen…",
    loadFailedTitle: "Muskelbelastung konnte nicht geladen werden",
    loadFailedDescription: "Deine Trainingspläne bleiben verfügbar. Öffne die Muskelbelastung erneut.",
    noPlanTitle: "Kein aktiver Plan",
    noPlanDescription: "Wähle zuerst einen aktiven Trainingsplan aus.",
    viewPlans: "Trainingspläne öffnen"
  },
  ar: {
    cardTitle: "الحمل العضلي",
    cardDescription: "افتح خريطة العضلات الكاملة من الأمام والخلف للخطة النشطة.",
    cardAction: "فتح الحمل العضلي",
    pageTitle: "الحمل العضلي",
    pageDescription: "راجع كيف توزع خطتك النشطة المجموعات المحددة على عضلات الجسم.",
    panelTitle: "الحمل العضلي للخطة النشطة",
    panelDescription: "تقدير مبني على المجموعات المحددة في خطة التمرين النشطة.",
    backToTrain: "العودة إلى التمرين",
    loading: "جارٍ تحميل الخطة النشطة…",
    loadFailedTitle: "تعذر تحميل الحمل العضلي",
    loadFailedDescription: "خطط التمرين ما زالت متاحة. حاول فتح الحمل العضلي مرة أخرى.",
    noPlanTitle: "لا توجد خطة نشطة",
    noPlanDescription: "اختر خطة تمرين نشطة قبل مراجعة الحمل العضلي.",
    viewPlans: "عرض خطط التمرين"
  }
} as const;

export function getMuscleLoadVisibilityCopy(language: SupportedLanguage) {
  return copy[language] ?? copy.en;
}
