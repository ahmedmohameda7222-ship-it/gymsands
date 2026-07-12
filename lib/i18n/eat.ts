"use client";

import { useCallback } from "react";
import { useTranslation } from "@/lib/i18n/use-translation";

const en = {
  eat: "Eat", day: "Day", week: "Week", addFood: "Add food", askChatGpt: "Ask ChatGPT", previousDay: "Previous day", nextDay: "Next day",
  manage: "Manage", setTarget: "Set target", targetUnavailable: "Target unavailable", fallbackTarget: "Fallback target", trainingTarget: "Training-day target", restTarget: "Rest-day target", highActivityTarget: "High-activity target",
  calories: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat", consumed: "Consumed", target: "Target", remaining: "remaining", unavailable: "Unavailable", aboveTarget: "above target", targetHit: "Target reached",
  plannedNextMeal: "Planned next meal", markEaten: "Mark eaten", adjustFirst: "Adjust first", replace: "Replace", noPlannedMeal: "No relevant planned meal",
  repeatFood: "Repeat a food", viewAll: "View all", meal: "Meal", date: "Date", logging: "Logging…", logged: "Logged", retry: "Retry",
  foodLog: "Food log", breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks", other: "Other", add: "Add", editFood: "Edit food log", saveChanges: "Save changes", delete: "Delete", notes: "Notes", quantity: "Quantity", serving: "Serving",
  remainingToday: "Remaining today", suggestedNext: "Suggested next action", proteinDinner: "Choose a protein-focused next meal", balancedMeal: "Choose a balanced next meal", targetComplete: "Targets are covered for today", logToContinue: "Log food to calculate what remains",
  water: "Water", more: "More", add250: "+250 ml", add500: "+500 ml", hydrationUnavailable: "Hydration unavailable",
  addFoodTitle: "Add food", quickRepeat: "Quick repeat", searchFoods: "Search foods", savedMeals: "Saved meals", barcode: "Barcode", customFoodMeal: "Custom food or meal", photoEstimate: "Estimate meal from photo", copyDay: "Copy from another day", back: "Back", close: "Close",
  destination: "Logging destination", chooseMethod: "Choose a logging method", foodSearchPlaceholder: "Search foods", logFood: "Log food", addToPlan: "Add to meal plan", macroPreview: "Macro preview", storedServingOnly: "Stored serving", noFoods: "No foods found", noSavedMeals: "No saved meals yet", editSavedMeal: "Edit saved meal",
  sourceDate: "Source date", loadSource: "Load day", selectItems: "Select items", sourceEmpty: "No food found on this day", sourceFailed: "Could not load this day", duplicatesFound: "Some selected items already exist on the target day", copySelected: "Copy selected items", copied: "items copied",
  weekCoverage: "Tracking coverage", noWeekData: "No nutrition data this week", noWeekDataDesc: "Log food on at least one day to see nutrition trends.", daysLogged: "{count} of 7 days logged", averagesLogged: "Averages are based on logged days", caloriesTrend: "Calories trend", proteinTrend: "Protein trend", avgCalories: "Average calories on logged days", avgProtein: "Average protein on logged days", adherence: "Compact adherence summary", openReports: "Open full reports",
  loadingLogs: "Loading food logs…", logsFailed: "Food logs could not load", waterFailed: "Water could not load", targetsFailed: "Targets could not load", plannedFailed: "Planned meals could not load", repeatsFailed: "Repeat foods could not load", weekFailed: "Week data could not load",
  settingsTitle: "Nutrition targets", settingsDesc: "Manage day-type targets outside the daily Eat flow.", returnEat: "Return to Eat", fallbackEditor: "Fallback target", estimateTargets: "Estimate targets", previewEstimate: "Estimate preview", saveFallback: "Save fallback target", fromProfile: "From profile", fromOnboarding: "From onboarding", latestMeasurement: "Latest measurement",
  successSaved: "Saved successfully", saveFailed: "Could not save", deleteConfirm: "Delete this food log?", deleteLinked: "Deleting this linked log returns its planned meal to planned status.", cameraUnavailable: "Camera unavailable. Enter the barcode manually.", scan: "Scan", stop: "Stop", lookup: "Lookup", product: "Product", noNested: "All methods stay inside this Add Food surface."
} as const;

export type EatKey = keyof typeof en;
type EatDictionary = Record<EatKey, string>;

const de: EatDictionary = {
  eat: "Essen", day: "Tag", week: "Woche", addFood: "Lebensmittel hinzufügen", askChatGpt: "ChatGPT fragen", previousDay: "Vorheriger Tag", nextDay: "Nächster Tag",
  manage: "Verwalten", setTarget: "Ziel festlegen", targetUnavailable: "Ziel nicht verfügbar", fallbackTarget: "Fallback-Ziel", trainingTarget: "Trainingstag-Ziel", restTarget: "Ruhetag-Ziel", highActivityTarget: "Ziel für hohe Aktivität",
  calories: "Kalorien", protein: "Protein", carbs: "Kohlenhydrate", fat: "Fett", consumed: "Verbraucht", target: "Ziel", remaining: "verbleibend", unavailable: "Nicht verfügbar", aboveTarget: "über Ziel", targetHit: "Ziel erreicht",
  plannedNextMeal: "Nächste geplante Mahlzeit", markEaten: "Als gegessen markieren", adjustFirst: "Zuerst anpassen", replace: "Ersetzen", noPlannedMeal: "Keine relevante geplante Mahlzeit",
  repeatFood: "Lebensmittel wiederholen", viewAll: "Alle anzeigen", meal: "Mahlzeit", date: "Datum", logging: "Wird protokolliert…", logged: "Protokolliert", retry: "Erneut versuchen",
  foodLog: "Ernährungsprotokoll", breakfast: "Frühstück", lunch: "Mittagessen", dinner: "Abendessen", snacks: "Snacks", other: "Sonstiges", add: "Hinzufügen", editFood: "Eintrag bearbeiten", saveChanges: "Änderungen speichern", delete: "Löschen", notes: "Notizen", quantity: "Menge", serving: "Portion",
  remainingToday: "Heute verbleibend", suggestedNext: "Empfohlene nächste Aktion", proteinDinner: "Wähle als Nächstes eine proteinreiche Mahlzeit", balancedMeal: "Wähle als Nächstes eine ausgewogene Mahlzeit", targetComplete: "Die heutigen Ziele sind abgedeckt", logToContinue: "Lebensmittel protokollieren, um den Rest zu berechnen",
  water: "Wasser", more: "Mehr", add250: "+250 ml", add500: "+500 ml", hydrationUnavailable: "Hydration nicht verfügbar",
  addFoodTitle: "Lebensmittel hinzufügen", quickRepeat: "Schnell wiederholen", searchFoods: "Lebensmittel suchen", savedMeals: "Gespeicherte Mahlzeiten", barcode: "Barcode", customFoodMeal: "Eigenes Lebensmittel oder Mahlzeit", photoEstimate: "Mahlzeit aus Foto schätzen", copyDay: "Von anderem Tag kopieren", back: "Zurück", close: "Schließen",
  destination: "Ziel der Protokollierung", chooseMethod: "Methode auswählen", foodSearchPlaceholder: "Lebensmittel suchen", logFood: "Lebensmittel protokollieren", addToPlan: "Zum Mahlzeitenplan", macroPreview: "Makro-Vorschau", storedServingOnly: "Gespeicherte Portion", noFoods: "Keine Lebensmittel gefunden", noSavedMeals: "Noch keine gespeicherten Mahlzeiten", editSavedMeal: "Gespeicherte Mahlzeit bearbeiten",
  sourceDate: "Quelldatum", loadSource: "Tag laden", selectItems: "Elemente auswählen", sourceEmpty: "An diesem Tag wurden keine Lebensmittel gefunden", sourceFailed: "Dieser Tag konnte nicht geladen werden", duplicatesFound: "Einige ausgewählte Elemente existieren bereits am Zieltag", copySelected: "Auswahl kopieren", copied: "Elemente kopiert",
  weekCoverage: "Tracking-Abdeckung", noWeekData: "Keine Ernährungsdaten in dieser Woche", noWeekDataDesc: "Protokolliere an mindestens einem Tag Lebensmittel, um Trends zu sehen.", daysLogged: "{count} von 7 Tagen protokolliert", averagesLogged: "Durchschnitte basieren auf protokollierten Tagen", caloriesTrend: "Kalorientrend", proteinTrend: "Proteintrend", avgCalories: "Durchschnittliche Kalorien an protokollierten Tagen", avgProtein: "Durchschnittliches Protein an protokollierten Tagen", adherence: "Kompakte Umsetzungsübersicht", openReports: "Vollständige Berichte öffnen",
  loadingLogs: "Ernährungsprotokolle werden geladen…", logsFailed: "Ernährungsprotokolle konnten nicht geladen werden", waterFailed: "Wasser konnte nicht geladen werden", targetsFailed: "Ziele konnten nicht geladen werden", plannedFailed: "Geplante Mahlzeiten konnten nicht geladen werden", repeatsFailed: "Wiederholbare Lebensmittel konnten nicht geladen werden", weekFailed: "Wochendaten konnten nicht geladen werden",
  settingsTitle: "Ernährungsziele", settingsDesc: "Verwalte Tagesziele außerhalb des täglichen Essen-Ablaufs.", returnEat: "Zurück zu Essen", fallbackEditor: "Fallback-Ziel", estimateTargets: "Ziele schätzen", previewEstimate: "Schätzvorschau", saveFallback: "Fallback-Ziel speichern", fromProfile: "Aus dem Profil", fromOnboarding: "Aus dem Onboarding", latestMeasurement: "Neueste Messung",
  successSaved: "Erfolgreich gespeichert", saveFailed: "Speichern fehlgeschlagen", deleteConfirm: "Diesen Ernährungseintrag löschen?", deleteLinked: "Beim Löschen wird die verknüpfte Mahlzeit wieder als geplant markiert.", cameraUnavailable: "Kamera nicht verfügbar. Barcode manuell eingeben.", scan: "Scannen", stop: "Stoppen", lookup: "Suchen", product: "Produkt", noNested: "Alle Methoden bleiben in dieser Oberfläche."
};

const ar: EatDictionary = {
  eat: "الأكل", day: "اليوم", week: "الأسبوع", addFood: "إضافة طعام", askChatGpt: "اسأل ChatGPT", previousDay: "اليوم السابق", nextDay: "اليوم التالي",
  manage: "إدارة", setTarget: "تحديد هدف", targetUnavailable: "الهدف غير متاح", fallbackTarget: "الهدف الاحتياطي", trainingTarget: "هدف يوم التمرين", restTarget: "هدف يوم الراحة", highActivityTarget: "هدف يوم النشاط العالي",
  calories: "السعرات", protein: "البروتين", carbs: "الكربوهيدرات", fat: "الدهون", consumed: "المستهلك", target: "الهدف", remaining: "متبقي", unavailable: "غير متاح", aboveTarget: "فوق الهدف", targetHit: "تم الوصول للهدف",
  plannedNextMeal: "الوجبة المخططة التالية", markEaten: "تسجيلها كمأكولة", adjustFirst: "تعديل أولًا", replace: "استبدال", noPlannedMeal: "لا توجد وجبة مخططة مناسبة",
  repeatFood: "تكرار طعام", viewAll: "عرض الكل", meal: "الوجبة", date: "التاريخ", logging: "جارٍ التسجيل…", logged: "تم التسجيل", retry: "إعادة المحاولة",
  foodLog: "سجل الطعام", breakfast: "الإفطار", lunch: "الغداء", dinner: "العشاء", snacks: "الوجبات الخفيفة", other: "أخرى", add: "إضافة", editFood: "تعديل سجل الطعام", saveChanges: "حفظ التغييرات", delete: "حذف", notes: "ملاحظات", quantity: "الكمية", serving: "الحصة",
  remainingToday: "المتبقي اليوم", suggestedNext: "الإجراء التالي المقترح", proteinDinner: "اختر وجبة تالية غنية بالبروتين", balancedMeal: "اختر وجبة تالية متوازنة", targetComplete: "تم تغطية أهداف اليوم", logToContinue: "سجّل الطعام لحساب المتبقي",
  water: "المياه", more: "المزيد", add250: "+250 مل", add500: "+500 مل", hydrationUnavailable: "بيانات المياه غير متاحة",
  addFoodTitle: "إضافة طعام", quickRepeat: "تكرار سريع", searchFoods: "البحث عن طعام", savedMeals: "الوجبات المحفوظة", barcode: "الباركود", customFoodMeal: "طعام أو وجبة مخصصة", photoEstimate: "تقدير وجبة من صورة", copyDay: "نسخ من يوم آخر", back: "رجوع", close: "إغلاق",
  destination: "وجهة التسجيل", chooseMethod: "اختر طريقة التسجيل", foodSearchPlaceholder: "ابحث عن طعام", logFood: "تسجيل الطعام", addToPlan: "إضافة لخطة الوجبات", macroPreview: "معاينة الماكروز", storedServingOnly: "الحصة المحفوظة", noFoods: "لم يتم العثور على أطعمة", noSavedMeals: "لا توجد وجبات محفوظة", editSavedMeal: "تعديل الوجبة المحفوظة",
  sourceDate: "تاريخ المصدر", loadSource: "تحميل اليوم", selectItems: "اختر العناصر", sourceEmpty: "لا يوجد طعام مسجل في هذا اليوم", sourceFailed: "تعذر تحميل هذا اليوم", duplicatesFound: "بعض العناصر المحددة موجودة بالفعل في اليوم المستهدف", copySelected: "نسخ العناصر المحددة", copied: "عنصر تم نسخه",
  weekCoverage: "تغطية التتبع", noWeekData: "لا توجد بيانات تغذية هذا الأسبوع", noWeekDataDesc: "سجّل الطعام في يوم واحد على الأقل لرؤية اتجاهات التغذية.", daysLogged: "تم تسجيل {count} من 7 أيام", averagesLogged: "المتوسطات مبنية على الأيام المسجلة", caloriesTrend: "اتجاه السعرات", proteinTrend: "اتجاه البروتين", avgCalories: "متوسط السعرات في الأيام المسجلة", avgProtein: "متوسط البروتين في الأيام المسجلة", adherence: "ملخص التزام مختصر", openReports: "فتح التقارير الكاملة",
  loadingLogs: "جارٍ تحميل سجلات الطعام…", logsFailed: "تعذر تحميل سجلات الطعام", waterFailed: "تعذر تحميل المياه", targetsFailed: "تعذر تحميل الأهداف", plannedFailed: "تعذر تحميل الوجبات المخططة", repeatsFailed: "تعذر تحميل الأطعمة القابلة للتكرار", weekFailed: "تعذر تحميل بيانات الأسبوع",
  settingsTitle: "أهداف التغذية", settingsDesc: "إدارة أهداف أنواع الأيام خارج مسار الأكل اليومي.", returnEat: "العودة إلى الأكل", fallbackEditor: "الهدف الاحتياطي", estimateTargets: "تقدير الأهداف", previewEstimate: "معاينة التقدير", saveFallback: "حفظ الهدف الاحتياطي", fromProfile: "من الملف الشخصي", fromOnboarding: "من الإعداد الأولي", latestMeasurement: "أحدث قياس",
  successSaved: "تم الحفظ بنجاح", saveFailed: "تعذر الحفظ", deleteConfirm: "هل تريد حذف سجل الطعام؟", deleteLinked: "حذف السجل المرتبط يعيد الوجبة المخططة إلى حالة مخططة.", cameraUnavailable: "الكاميرا غير متاحة. أدخل الباركود يدويًا.", scan: "مسح", stop: "إيقاف", lookup: "بحث", product: "المنتج", noNested: "كل الطرق داخل واجهة إضافة الطعام نفسها."
};

const copy: Record<"en" | "de" | "ar", EatDictionary> = { en, de, ar };

export function useEatTranslation() {
  const { language, dir } = useTranslation();
  const locale = language === "de" ? "de-DE" : language === "ar" ? "ar-EG" : "en-GB";
  const et = useCallback((key: EatKey, values?: Record<string, string | number>): string => {
    const template: string = copy[language][key];
    if (!values) return template;
    return Object.entries(values).reduce<string>((result, [name, item]) => result.replaceAll(`{${name}}`, String(item)), template);
  }, [language]);
  const formatDate = useCallback((value: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string => new Intl.DateTimeFormat(locale, options).format(new Date(`${value}T12:00:00`)), [locale]);
  const mealLabel = useCallback((value: string): string => {
    const clean = value.toLowerCase();
    if (clean === "breakfast") return et("breakfast");
    if (clean === "lunch") return et("lunch");
    if (clean === "dinner") return et("dinner");
    if (clean === "snack" || clean === "snacks") return et("snacks");
    return et("other");
  }, [et]);
  return { language, dir, locale, et, formatDate, mealLabel };
}
