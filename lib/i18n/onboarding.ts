"use client";

import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { ValidationIssue } from "@/lib/onboarding/adaptive-profile";
import type { ReviewText } from "@/lib/onboarding/review-summary";
import type { AiPermissionSection } from "@/types";

const en = {
  title: "Fitness profile setup",
  editTitle: "Editing fitness profile",
  editDescription: "Review and update the profile Plaivra uses for training, nutrition, constraints, and ChatGPT access.",
  firstDescription: "Tell Plaivra only what you choose to share. Nothing is inferred or silently filled in.",
  step: "Step",
  of: "of",
  back: "Back",
  next: "Next",
  skip: "Skip",
  cancel: "Cancel",
  stay: "Stay here",
  discard: "Discard changes",
  cancelQuestion: "Discard unsaved changes?",
  cancelDetail: "Changes made since the last save will be lost.",
  saving: "Saving…",
  finish: "Finish setup",
  saveChanges: "Save changes",
  retry: "Retry",
  edit: "Edit",
  optional: "Optional",
  required: "Required",
  essential: "Essential",
  optionalDetails: "Optional details",
  loading: "Loading saved setup…",
  loadFailure: "Saved data could not be loaded",
  loadFailureDetail: "Plaivra will not replace this saved category until it loads successfully.",
  saveFailure: "Changes could not be saved",
  offline: "You appear to be offline. Reconnect before saving.",
  reviewErrors: "Review the highlighted fields before continuing.",
  noValue: "Not provided",
  noneSelected: "None selected",
  noPreference: "No preference",
  profileSection: "Basic Profile",
  goalsSection: "Main Goals",
  trainingSection: "Training Profile",
  nutritionSection: "Nutrition Profile",
  constraintsSection: "Health and Physical Constraints",
  permissionsSection: "ChatGPT Access",
  reviewSection: "Review & Finish",
  basicIntro: "Age is required for the existing 16+ launch eligibility rule. Other body details are optional.",
  age: "Age",
  sex: "Sex",
  height: "Height",
  currentWeight: "Current weight",
  preferNotSay: "Prefer not to say",
  male: "Male",
  female: "Female",
  otherSex: "Other / self-described",
  goalsIntro: "Choose every goal that matters, then identify one primary goal.",
  goals: "Goals",
  primaryGoal: "Primary goal",
  targetWeight: "Target weight",
  trainingIntro: "What sport or activity are you training for? The remaining questions adapt to this choice.",
  primarySport: "Primary sport or activity",
  secondarySports: "Secondary sports or activities",
  otherSport: "Other sport or activity",
  experienceLevel: "Experience level",
  trainingLocation: "Training location",
  activityLevel: "Activity level",
  daysPerWeek: "Days per week",
  availableDays: "Available days",
  sessionDuration: "Session duration",
  preferredTime: "Preferred workout time",
  likedActivities: "Activities or exercises you like",
  dislikedActivities: "Activities or exercises you dislike",
  sportSpecific: "Questions for your primary activity",
  nutritionIntro: "Share practical food preferences only. Plaivra does not infer cuisines, allergies, or restrictions.",
  nutritionGoal: "Nutrition goal",
  mealsPerDay: "Daily meal count",
  preferredCuisines: "Preferred cuisines",
  foodsLiked: "Foods you like",
  foodsDisliked: "Foods you dislike",
  allergies: "Allergies",
  restrictions: "Dietary restrictions",
  cookingAbility: "Cooking ability",
  cookingTime: "Available cooking time",
  mealPrep: "Meal-prep preference",
  weeklyBudget: "Weekly food budget",
  currency: "Currency",
  eatingSchedule: "Eating schedule",
  supplements: "Supplements",
  tracksMacros: "Do you currently track calories or macros?",
  constraintsIntro: "This section is optional. Describe practical limits without providing a diagnosis.",
  injuries: "Injuries or limitations",
  painAreas: "Pain-sensitive areas",
  movementsAvoid: "Movements to avoid",
  discomfortExercises: "Exercises that cause discomfort",
  mobilityLimits: "Mobility limitations",
  professionalRestrictions: "Doctor or physiotherapist restrictions",
  retainedNotes: "Earlier notes retained",
  clearRetained: "Clear retained notes",
  permissionsIntro: "These choices save Plaivra tool permissions. They do not mean ChatGPT is connected.",
  fullAccess: "Full access",
  fullAccessDetail: "ChatGPT may read and update all supported Plaivra fitness areas. Account security, authentication, billing, privacy controls, deletion controls, admin functions, and internal security records are excluded.",
  customAccess: "Custom access",
  customAccessDetail: "Choose the supported Plaivra areas and actions ChatGPT may use.",
  viewData: "View data",
  updateData: "Create or update data",
  confirmPermissions: "I confirm these ChatGPT access permissions.",
  permissionLoadFailed: "Saved permissions could not be confirmed. Retry before changing or saving them.",
  permissionSeparate: "OAuth connection status is managed separately in Settings.",
  reviewIntro: "Check every section before saving. Use Edit to return without losing entered data.",
  basicSummary: "Basic profile",
  goalsSummary: "Goals",
  trainingSummary: "Training",
  nutritionSummary: "Nutrition",
  constraintsSummary: "Physical constraints",
  permissionsSummary: "ChatGPT access",
  custom: "Custom",
  full: "Full",
  yes: "Yes",
  no: "No",
  notSure: "Not sure",
  saved: "Setup saved",
  savedDetail: "Your profile and explicit ChatGPT permissions were saved.",
  sourceOnboarding: "Profile and training data",
  sourceNutrition: "Nutrition profile",
  sourceConstraints: "Physical constraints",
  sourcePermissions: "ChatGPT permissions"
} as const;

type Key = keyof typeof en;

const de: Record<Key, string> = {
  title: "Fitnessprofil einrichten", editTitle: "Fitnessprofil bearbeiten", editDescription: "Prüfe und aktualisiere das Profil für Training, Ernährung, Einschränkungen und ChatGPT-Zugriff.", firstDescription: "Teile nur Angaben, die du selbst auswählst. Nichts wird automatisch angenommen.", step: "Schritt", of: "von", back: "Zurück", next: "Weiter", skip: "Überspringen", cancel: "Abbrechen", stay: "Hier bleiben", discard: "Änderungen verwerfen", cancelQuestion: "Ungespeicherte Änderungen verwerfen?", cancelDetail: "Änderungen seit dem letzten Speichern gehen verloren.", saving: "Wird gespeichert…", finish: "Einrichtung abschließen", saveChanges: "Änderungen speichern", retry: "Erneut versuchen", edit: "Bearbeiten", optional: "Optional", required: "Erforderlich", essential: "Wesentlich", optionalDetails: "Optionale Angaben", loading: "Gespeicherte Einrichtung wird geladen…", loadFailure: "Gespeicherte Daten konnten nicht geladen werden", loadFailureDetail: "Plaivra ersetzt diese gespeicherte Kategorie erst nach erfolgreichem Laden.", saveFailure: "Änderungen konnten nicht gespeichert werden", offline: "Du scheinst offline zu sein. Stelle vor dem Speichern die Verbindung wieder her.", reviewErrors: "Prüfe die markierten Felder.", noValue: "Nicht angegeben", noneSelected: "Nichts ausgewählt", noPreference: "Keine Präferenz", profileSection: "Basisprofil", goalsSection: "Hauptziele", trainingSection: "Trainingsprofil", nutritionSection: "Ernährungsprofil", constraintsSection: "Gesundheit und körperliche Einschränkungen", permissionsSection: "ChatGPT-Zugriff", reviewSection: "Prüfen & Abschließen", basicIntro: "Das Alter ist wegen der bestehenden 16+-Regel erforderlich. Andere Körperdaten sind optional.", age: "Alter", sex: "Geschlecht", height: "Größe", currentWeight: "Aktuelles Gewicht", preferNotSay: "Keine Angabe", male: "Männlich", female: "Weiblich", otherSex: "Andere / eigene Angabe", goalsIntro: "Wähle alle wichtigen Ziele und danach ein Hauptziel.", goals: "Ziele", primaryGoal: "Hauptziel", targetWeight: "Zielgewicht", trainingIntro: "Für welche Sportart oder Aktivität trainierst du? Weitere Fragen passen sich daran an.", primarySport: "Primäre Sportart oder Aktivität", secondarySports: "Weitere Sportarten oder Aktivitäten", otherSport: "Andere Sportart oder Aktivität", experienceLevel: "Erfahrungsniveau", trainingLocation: "Trainingsort", activityLevel: "Aktivitätsniveau", daysPerWeek: "Tage pro Woche", availableDays: "Verfügbare Tage", sessionDuration: "Dauer pro Einheit", preferredTime: "Bevorzugte Trainingszeit", likedActivities: "Beliebte Aktivitäten oder Übungen", dislikedActivities: "Unbeliebte Aktivitäten oder Übungen", sportSpecific: "Fragen zur primären Aktivität", nutritionIntro: "Teile nur praktische Ernährungspräferenzen. Plaivra nimmt keine Küche, Allergie oder Einschränkung an.", nutritionGoal: "Ernährungsziel", mealsPerDay: "Mahlzeiten pro Tag", preferredCuisines: "Bevorzugte Küchen", foodsLiked: "Lebensmittel, die du magst", foodsDisliked: "Lebensmittel, die du nicht magst", allergies: "Allergien", restrictions: "Ernährungseinschränkungen", cookingAbility: "Kochkenntnisse", cookingTime: "Verfügbare Kochzeit", mealPrep: "Meal-Prep-Präferenz", weeklyBudget: "Wöchentliches Lebensmittelbudget", currency: "Währung", eatingSchedule: "Essenszeiten", supplements: "Supplemente", tracksMacros: "Trackst du derzeit Kalorien oder Makros?", constraintsIntro: "Dieser Abschnitt ist optional. Beschreibe praktische Grenzen ohne Diagnose.", injuries: "Verletzungen oder Einschränkungen", painAreas: "Schmerzempfindliche Bereiche", movementsAvoid: "Zu vermeidende Bewegungen", discomfortExercises: "Übungen mit Beschwerden", mobilityLimits: "Mobilitätseinschränkungen", professionalRestrictions: "Vorgaben von Arzt oder Physiotherapie", retainedNotes: "Frühere Notizen beibehalten", clearRetained: "Beibehaltene Notizen löschen", permissionsIntro: "Diese Auswahl speichert Plaivra-Berechtigungen. Sie bestätigt keine ChatGPT-Verbindung.", fullAccess: "Vollzugriff", fullAccessDetail: "ChatGPT darf alle unterstützten Fitnessbereiche lesen und aktualisieren. Kontosicherheit, Anmeldung, Abrechnung, Datenschutz, Löschung, Adminfunktionen und interne Sicherheitsdaten sind ausgeschlossen.", customAccess: "Benutzerdefinierter Zugriff", customAccessDetail: "Wähle unterstützte Plaivra-Bereiche und Aktionen.", viewData: "Daten ansehen", updateData: "Daten erstellen oder aktualisieren", confirmPermissions: "Ich bestätige diese ChatGPT-Zugriffsrechte.", permissionLoadFailed: "Gespeicherte Berechtigungen konnten nicht bestätigt werden. Vor Änderungen erneut laden.", permissionSeparate: "Der OAuth-Verbindungsstatus wird separat in den Einstellungen verwaltet.", reviewIntro: "Prüfe alle Abschnitte. Mit Bearbeiten kannst du zurückkehren, ohne Eingaben zu verlieren.", basicSummary: "Basisprofil", goalsSummary: "Ziele", trainingSummary: "Training", nutritionSummary: "Ernährung", constraintsSummary: "Körperliche Einschränkungen", permissionsSummary: "ChatGPT-Zugriff", custom: "Benutzerdefiniert", full: "Voll", yes: "Ja", no: "Nein", notSure: "Nicht sicher", saved: "Einrichtung gespeichert", savedDetail: "Profil und ausdrücklich gewählte ChatGPT-Berechtigungen wurden gespeichert.", sourceOnboarding: "Profil- und Trainingsdaten", sourceNutrition: "Ernährungsprofil", sourceConstraints: "Körperliche Einschränkungen", sourcePermissions: "ChatGPT-Berechtigungen"
};

const ar: Record<Key, string> = {
  title: "إعداد الملف الرياضي", editTitle: "تعديل الملف الرياضي", editDescription: "راجع وحدّث البيانات التي تستخدمها Plaivra للتدريب والتغذية والقيود وصلاحيات ChatGPT.", firstDescription: "أدخل فقط المعلومات التي تختار مشاركتها. لن يتم افتراض أو حفظ بيانات من دون اختيارك.", step: "الخطوة", of: "من", back: "رجوع", next: "التالي", skip: "تخطي", cancel: "إلغاء", stay: "البقاء هنا", discard: "تجاهل التغييرات", cancelQuestion: "تجاهل التغييرات غير المحفوظة؟", cancelDetail: "ستفقد التغييرات التي لم يتم حفظها.", saving: "جارٍ الحفظ…", finish: "إنهاء الإعداد", saveChanges: "حفظ التغييرات", retry: "إعادة المحاولة", edit: "تعديل", optional: "اختياري", required: "مطلوب", essential: "أساسي", optionalDetails: "تفاصيل اختيارية", loading: "جارٍ تحميل الإعداد المحفوظ…", loadFailure: "تعذر تحميل البيانات المحفوظة", loadFailureDetail: "لن تستبدل Plaivra هذه الفئة قبل تحميلها بنجاح.", saveFailure: "تعذر حفظ التغييرات", offline: "يبدو أنك غير متصل بالإنترنت. أعد الاتصال قبل الحفظ.", reviewErrors: "راجع الحقول المحددة قبل المتابعة.", noValue: "غير مُدخل", noneSelected: "لا يوجد اختيار", noPreference: "لا تفضيل", profileSection: "الملف الأساسي", goalsSection: "الأهداف الرئيسية", trainingSection: "ملف التدريب", nutritionSection: "ملف التغذية", constraintsSection: "الصحة والقيود الجسدية", permissionsSection: "صلاحيات ChatGPT", reviewSection: "المراجعة والإنهاء", basicIntro: "العمر مطلوب بسبب شرط الأهلية الحالي 16+. باقي بيانات الجسم اختيارية.", age: "العمر", sex: "الجنس", height: "الطول", currentWeight: "الوزن الحالي", preferNotSay: "أفضل عدم الإفصاح", male: "ذكر", female: "أنثى", otherSex: "آخر / وصف ذاتي", goalsIntro: "اختر كل الأهداف المهمة ثم حدد هدفًا رئيسيًا واحدًا.", goals: "الأهداف", primaryGoal: "الهدف الرئيسي", targetWeight: "الوزن المستهدف", trainingIntro: "ما الرياضة أو النشاط الذي تتدرب من أجله؟ ستتغير الأسئلة التالية وفقًا لاختيارك.", primarySport: "الرياضة أو النشاط الرئيسي", secondarySports: "رياضات أو أنشطة إضافية", otherSport: "رياضة أو نشاط آخر", experienceLevel: "مستوى الخبرة", trainingLocation: "مكان التدريب", activityLevel: "مستوى النشاط", daysPerWeek: "الأيام أسبوعيًا", availableDays: "الأيام المتاحة", sessionDuration: "مدة الحصة", preferredTime: "وقت التدريب المفضل", likedActivities: "أنشطة أو تمارين تحبها", dislikedActivities: "أنشطة أو تمارين لا تحبها", sportSpecific: "أسئلة خاصة بالنشاط الرئيسي", nutritionIntro: "شارك تفضيلات عملية فقط. لن تفترض Plaivra مطبخًا أو حساسية أو قيودًا غذائية.", nutritionGoal: "هدف التغذية", mealsPerDay: "عدد الوجبات يوميًا", preferredCuisines: "المطابخ المفضلة", foodsLiked: "أطعمة تحبها", foodsDisliked: "أطعمة لا تحبها", allergies: "الحساسيات", restrictions: "القيود الغذائية", cookingAbility: "مهارة الطهي", cookingTime: "وقت الطهي المتاح", mealPrep: "تفضيل تجهيز الوجبات", weeklyBudget: "ميزانية الطعام الأسبوعية", currency: "العملة", eatingSchedule: "مواعيد الأكل", supplements: "المكملات", tracksMacros: "هل تتابع السعرات أو الماكروز حاليًا؟", constraintsIntro: "هذا القسم اختياري. اذكر القيود العملية من دون تقديم تشخيص.", injuries: "إصابات أو قيود", painAreas: "مناطق حساسة للألم", movementsAvoid: "حركات يجب تجنبها", discomfortExercises: "تمارين تسبب انزعاجًا", mobilityLimits: "قيود الحركة", professionalRestrictions: "قيود من طبيب أو أخصائي علاج طبيعي", retainedNotes: "ملاحظات سابقة محفوظة", clearRetained: "حذف الملاحظات المحفوظة", permissionsIntro: "هذه الاختيارات تحفظ صلاحيات أدوات Plaivra ولا تثبت أن ChatGPT متصل.", fullAccess: "صلاحية كاملة", fullAccessDetail: "يمكن لـChatGPT قراءة وتحديث جميع مناطق اللياقة المدعومة. لا تشمل الصلاحية أمان الحساب أو تسجيل الدخول أو الدفع أو الخصوصية أو حذف البيانات أو الإدارة أو سجلات الأمان الداخلية.", customAccess: "صلاحية مخصصة", customAccessDetail: "اختر مناطق Plaivra والإجراءات المسموح بها.", viewData: "عرض البيانات", updateData: "إنشاء أو تحديث البيانات", confirmPermissions: "أؤكد صلاحيات وصول ChatGPT هذه.", permissionLoadFailed: "تعذر تأكيد الصلاحيات المحفوظة. أعد المحاولة قبل التغيير أو الحفظ.", permissionSeparate: "تتم إدارة حالة اتصال OAuth بشكل منفصل في الإعدادات.", reviewIntro: "راجع كل الأقسام قبل الحفظ. استخدم تعديل للعودة من دون فقدان البيانات.", basicSummary: "الملف الأساسي", goalsSummary: "الأهداف", trainingSummary: "التدريب", nutritionSummary: "التغذية", constraintsSummary: "القيود الجسدية", permissionsSummary: "صلاحيات ChatGPT", custom: "مخصصة", full: "كاملة", yes: "نعم", no: "لا", notSure: "غير متأكد", saved: "تم حفظ الإعداد", savedDetail: "تم حفظ ملفك وصلاحيات ChatGPT التي اخترتها صراحةً.", sourceOnboarding: "بيانات الملف والتدريب", sourceNutrition: "ملف التغذية", sourceConstraints: "القيود الجسدية", sourcePermissions: "صلاحيات ChatGPT"
};

const dictionaries = { en, de, ar };

export const GOAL_LABELS = {
  en: { lose_fat: "Lose fat", build_muscle: "Build muscle", improve_strength: "Improve strength", improve_endurance: "Improve endurance", body_recomposition: "Body recomposition", improve_health: "Improve health", reduce_stress: "Reduce stress", improve_mobility: "Improve mobility" },
  de: { lose_fat: "Fett verlieren", build_muscle: "Muskeln aufbauen", improve_strength: "Kraft verbessern", improve_endurance: "Ausdauer verbessern", body_recomposition: "Körperrekomposition", improve_health: "Gesundheit verbessern", reduce_stress: "Stress reduzieren", improve_mobility: "Beweglichkeit verbessern" },
  ar: { lose_fat: "خسارة الدهون", build_muscle: "بناء العضلات", improve_strength: "زيادة القوة", improve_endurance: "تحسين التحمل", body_recomposition: "إعادة تكوين الجسم", improve_health: "تحسين الصحة", reduce_stress: "تقليل التوتر", improve_mobility: "تحسين المرونة" }
} as const;

export const SPORT_LABELS = {
  en: { general_fitness: "General fitness / no specific sport", gym_strength: "Gym / strength training", pilates: "Pilates", yoga_mobility: "Yoga / mobility", running: "Running", walking_hiking: "Walking / hiking", cycling: "Cycling", swimming: "Swimming", football: "Football / soccer", basketball: "Basketball", tennis_racket: "Tennis / racket sports", boxing_martial_arts: "Boxing / martial arts", crossfit_functional: "CrossFit / functional fitness", home_workouts: "Home workouts", other: "Other" },
  de: { general_fitness: "Allgemeine Fitness / keine bestimmte Sportart", gym_strength: "Fitnessstudio / Krafttraining", pilates: "Pilates", yoga_mobility: "Yoga / Beweglichkeit", running: "Laufen", walking_hiking: "Gehen / Wandern", cycling: "Radfahren", swimming: "Schwimmen", football: "Fußball", basketball: "Basketball", tennis_racket: "Tennis / Rückschlagsport", boxing_martial_arts: "Boxen / Kampfsport", crossfit_functional: "CrossFit / funktionelle Fitness", home_workouts: "Training zu Hause", other: "Andere" },
  ar: { general_fitness: "لياقة عامة / من دون رياضة محددة", gym_strength: "الجيم / تمارين القوة", pilates: "بيلاتس", yoga_mobility: "يوغا / مرونة", running: "جري", walking_hiking: "مشي / تنزه", cycling: "دراجات", swimming: "سباحة", football: "كرة قدم", basketball: "كرة سلة", tennis_racket: "تنس / رياضات المضرب", boxing_martial_arts: "ملاكمة / فنون قتالية", crossfit_functional: "كروس فت / لياقة وظيفية", home_workouts: "تمارين منزلية", other: "أخرى" }
} as const;

const fieldLabels: Record<"en" | "de" | "ar", Record<string, string>> = {
  en: {
    available_equipment: "Available equipment", training_style: "Preferred training style", preferred_split: "Preferred split", strength_level: "Strength level or recent training level", recent_lifts: "Recent lifts", cardio_preferences: "Cardio preferences",
    weekly_distance: "Current weekly distance", event_goal: "Preferred distance or event goal", current_pace: "Current pace", running_surface: "Usual surface",
    walking_weekly_volume: "Current weekly walking or hiking duration or distance", walking_terrain: "Preferred terrain", elevation_preference: "Elevation preference or hill tolerance", walking_environment: "Indoor, outdoor or mixed", walking_goal: "Distance or event goal",
    cycling_type: "Cycling type", weekly_cycling: "Current weekly distance or duration", cycling_environment: "Indoor, outdoor or both", cycling_equipment: "Equipment availability", cycling_goal: "Event or endurance goal",
    pool_availability: "Pool availability", preferred_strokes: "Preferred strokes", swim_session: "Current session distance or duration", swimming_goal: "Competition or fitness goal",
    pilates_format: "Mat, reformer or both", reformer_availability: "Reformer availability", pilates_focus: "Mobility, strength or balanced focus",
    yoga_style: "Preferred style", mobility_focus: "Mobility focus", session_focus_intensity: "Session focus or intensity preference",
    sport_role: "Position or role", practice_frequency: "Practice frequency", match_frequency: "Match frequency", conditioning_needs: "Conditioning needs", strength_support_needs: "Strength-support needs",
    discipline: "Discipline", technical_sessions: "Technical sessions per week", conditioning_preference: "Conditioning preference", combat_equipment: "Equipment availability"
  },
  de: {
    available_equipment: "Verfügbare Ausrüstung", training_style: "Bevorzugter Trainingsstil", preferred_split: "Bevorzugter Split", strength_level: "Kraftniveau oder aktueller Trainingsstand", recent_lifts: "Aktuelle Kraftwerte", cardio_preferences: "Cardio-Präferenzen",
    weekly_distance: "Aktuelle Wochenstrecke", event_goal: "Distanz- oder Wettkampfziel", current_pace: "Aktuelles Tempo", running_surface: "Üblicher Untergrund",
    walking_weekly_volume: "Aktuelle wöchentliche Geh- oder Wanderdauer beziehungsweise Strecke", walking_terrain: "Bevorzugtes Gelände", elevation_preference: "Höhenprofil oder Bergtoleranz", walking_environment: "Drinnen, draußen oder gemischt", walking_goal: "Strecken- oder Veranstaltungsziel",
    cycling_type: "Radsportart", weekly_cycling: "Wöchentliche Strecke oder Dauer", cycling_environment: "Drinnen, draußen oder beides", cycling_equipment: "Verfügbare Ausrüstung", cycling_goal: "Wettkampf- oder Ausdauerziel",
    pool_availability: "Schwimmbad-Verfügbarkeit", preferred_strokes: "Bevorzugte Schwimmstile", swim_session: "Aktuelle Strecke oder Dauer", swimming_goal: "Wettkampf- oder Fitnessziel",
    pilates_format: "Matte, Reformer oder beides", reformer_availability: "Reformer-Verfügbarkeit", pilates_focus: "Beweglichkeit, Kraft oder ausgewogener Fokus",
    yoga_style: "Bevorzugter Stil", mobility_focus: "Beweglichkeitsfokus", session_focus_intensity: "Einheitenfokus oder Intensitätspräferenz",
    sport_role: "Position oder Rolle", practice_frequency: "Trainingshäufigkeit", match_frequency: "Spielhäufigkeit", conditioning_needs: "Konditionsbedarf", strength_support_needs: "Unterstützendes Krafttraining",
    discipline: "Disziplin", technical_sessions: "Technikeinheiten pro Woche", conditioning_preference: "Konditionspräferenz", combat_equipment: "Verfügbare Ausrüstung"
  },
  ar: {
    available_equipment: "المعدات المتاحة", training_style: "أسلوب التدريب المفضل", preferred_split: "تقسيمة التدريب المفضلة", strength_level: "مستوى القوة أو مستوى التدريب الحالي", recent_lifts: "الأوزان الحديثة", cardio_preferences: "تفضيلات الكارديو",
    weekly_distance: "المسافة الأسبوعية الحالية", event_goal: "هدف المسافة أو السباق", current_pace: "الوتيرة الحالية", running_surface: "سطح الجري المعتاد",
    walking_weekly_volume: "مدة أو مسافة المشي أو التنزه الأسبوعية الحالية", walking_terrain: "التضاريس المفضلة", elevation_preference: "تفضيل الارتفاعات أو تحمل المرتفعات", walking_environment: "داخلي أو خارجي أو مختلط", walking_goal: "هدف المسافة أو الفعالية",
    cycling_type: "نوع ركوب الدراجات", weekly_cycling: "المسافة أو المدة الأسبوعية", cycling_environment: "داخلي أو خارجي أو كلاهما", cycling_equipment: "المعدات المتاحة", cycling_goal: "هدف سباق أو تحمل",
    pool_availability: "توفر المسبح", preferred_strokes: "طرق السباحة المفضلة", swim_session: "مسافة أو مدة الحصة الحالية", swimming_goal: "هدف المنافسة أو اللياقة",
    pilates_format: "حصيرة أو ريفورمر أو كلاهما", reformer_availability: "توفر جهاز الريفورمر", pilates_focus: "تركيز المرونة أو القوة أو التوازن",
    yoga_style: "الأسلوب المفضل", mobility_focus: "تركيز المرونة", session_focus_intensity: "تركيز الحصة أو شدة التدريب المفضلة",
    sport_role: "المركز أو الدور", practice_frequency: "عدد التدريبات", match_frequency: "عدد المباريات", conditioning_needs: "احتياجات اللياقة", strength_support_needs: "احتياجات دعم القوة",
    discipline: "نوع الفن القتالي", technical_sessions: "الحصص الفنية أسبوعيًا", conditioning_preference: "تفضيل اللياقة", combat_equipment: "المعدات المتاحة"
  }
};

const optionLabels: Record<"en" | "de" | "ar", Record<string, string>> = {
  en: {
    male: "Male", female: "Female", prefer_not_to_say: "Prefer not to say", new: "New", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
    gym: "Gym", home: "Home", outdoors: "Outdoors", studio: "Studio", pool: "Pool", mixed: "Mixed", low: "Low", moderate: "Moderate", high: "High", very_high: "Very high",
    morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening", variable: "Variable", balanced: "Balanced", fat_loss: "Fat loss", muscle_gain: "Muscle gain", performance: "Performance", health: "Health", maintenance: "Maintenance",
    none: "None", basic: "Basic", comfortable: "Comfortable", some_meals: "Some meals", most_meals: "Most meals", batch_cooking: "Batch cooking", flexible: "Flexible", no_preference: "No preference",
    strength: "Strength", hypertrophy: "Hypertrophy", functional: "Functional", full_body: "Full body", upper_lower: "Upper/lower", push_pull_legs: "Push/pull/legs", sport_support: "Sport support",
    road: "Road", trail: "Trail", treadmill: "Treadmill", mountain: "Mountain", commuting: "Commuting", indoor: "Indoor", outdoor: "Outdoor", both: "Both", regular: "Regular", limited: "Limited", seasonal: "Seasonal",
    mat: "Mat", reformer: "Reformer", mobility: "Mobility", gentle: "Gentle", challenging: "Challenging", restorative: "Restorative", flat: "Flat", hilly: "Hilly", urban: "Urban"
  },
  de: {
    male: "Männlich", female: "Weiblich", prefer_not_to_say: "Keine Angabe", new: "Neu", beginner: "Anfänger", intermediate: "Fortgeschritten", advanced: "Sehr fortgeschritten",
    gym: "Fitnessstudio", home: "Zu Hause", outdoors: "Draußen", studio: "Studio", pool: "Schwimmbad", mixed: "Gemischt", low: "Niedrig", moderate: "Mittel", high: "Hoch", very_high: "Sehr hoch",
    morning: "Morgens", midday: "Mittags", afternoon: "Nachmittags", evening: "Abends", variable: "Variabel", balanced: "Ausgewogen", fat_loss: "Fettverlust", muscle_gain: "Muskelaufbau", performance: "Leistung", health: "Gesundheit", maintenance: "Gewicht halten",
    none: "Keine", basic: "Grundkenntnisse", comfortable: "Sicher", some_meals: "Einige Mahlzeiten", most_meals: "Die meisten Mahlzeiten", batch_cooking: "Vorkochen", flexible: "Flexibel", no_preference: "Keine Präferenz",
    strength: "Kraft", hypertrophy: "Muskelaufbau", functional: "Funktionell", full_body: "Ganzkörper", upper_lower: "Ober-/Unterkörper", push_pull_legs: "Push/Pull/Beine", sport_support: "Sportbegleitend",
    road: "Straße", trail: "Trail", treadmill: "Laufband", mountain: "Berg", commuting: "Alltag/Pendeln", indoor: "Drinnen", outdoor: "Draußen", both: "Beides", regular: "Regelmäßig", limited: "Eingeschränkt", seasonal: "Saisonal",
    mat: "Matte", reformer: "Reformer", mobility: "Beweglichkeit", gentle: "Sanft", challenging: "Anspruchsvoll", restorative: "Regenerativ", flat: "Flach", hilly: "Hügelig", urban: "Städtisch"
  },
  ar: {
    male: "ذكر", female: "أنثى", prefer_not_to_say: "أفضل عدم الإفصاح", new: "جديد", beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم",
    gym: "الجيم", home: "المنزل", outdoors: "الخارج", studio: "الاستوديو", pool: "المسبح", mixed: "مختلط", low: "منخفض", moderate: "متوسط", high: "مرتفع", very_high: "مرتفع جدًا",
    morning: "الصباح", midday: "الظهر", afternoon: "بعد الظهر", evening: "المساء", variable: "متغير", balanced: "متوازن", fat_loss: "خسارة الدهون", muscle_gain: "بناء العضلات", performance: "الأداء", health: "الصحة", maintenance: "الحفاظ على الوزن",
    none: "لا يوجد", basic: "أساسي", comfortable: "جيد", some_meals: "بعض الوجبات", most_meals: "معظم الوجبات", batch_cooking: "تحضير دفعات", flexible: "مرن", no_preference: "لا تفضيل",
    strength: "قوة", hypertrophy: "تضخم عضلي", functional: "وظيفي", full_body: "جسم كامل", upper_lower: "علوي/سفلي", push_pull_legs: "دفع/سحب/أرجل", sport_support: "دعم رياضي",
    road: "طريق", trail: "مسارات", treadmill: "جهاز الجري", mountain: "جبلي", commuting: "تنقل", indoor: "داخلي", outdoor: "خارجي", both: "كلاهما", regular: "منتظم", limited: "محدود", seasonal: "موسمي",
    mat: "حصيرة", reformer: "ريفورمر", mobility: "مرونة", gentle: "خفيف", challenging: "صعب", restorative: "استشفائي", flat: "مستوٍ", hilly: "مرتفعات", urban: "داخل المدينة"
  }
};

const dayLabels: Record<"en" | "de" | "ar", Record<string, string>> = {
  en: { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" },
  de: { monday: "Montag", tuesday: "Dienstag", wednesday: "Mittwoch", thursday: "Donnerstag", friday: "Freitag", saturday: "Samstag", sunday: "Sonntag" },
  ar: { monday: "الاثنين", tuesday: "الثلاثاء", wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة", saturday: "السبت", sunday: "الأحد" }
};

const validationMessages: Record<"en" | "de" | "ar", Record<ValidationIssue["code"], string>> = {
  en: {
    age_required: "Age is required.", age_range: "Age must be a whole number between 16 and 100.", height_range: "Height must be between 120 and 250 cm.", weight_range: "Current weight must be between 35 and 350 kg.", goals_required: "Select at least one goal.", primary_goal_required: "Choose one primary goal.", primary_goal_invalid: "The primary goal must be one of the selected goals.", target_weight_range: "Target weight must be between 35 and 350 kg.", primary_sport_required: "Choose a primary sport or activity.", custom_sport_required: "Enter the sport or activity.", experience_required: "Choose an experience level.", location_required: "Choose a training location.", activity_required: "Choose an activity level.", training_days_range: "Days per week must be between 1 and 7.", available_days_required: "Select at least one available day.", session_duration_range: "Session duration must be between 10 and 240 minutes.", preferred_time_required: "Choose a preferred workout time.", sport_field_required: "This sport-specific field is required.", nutrition_goal_required: "Choose a nutrition goal.", meal_count_range: "Daily meal count must be between 1 and 12.", cuisine_required: "Add a cuisine or choose no preference.", cooking_time_range: "Cooking time must be between 0 and 1440 minutes.", budget_range: "Weekly food budget must be zero or more.", budget_currency_required: "Choose a currency for the food budget.", permission_load_failed: "Retry the saved permission load before continuing.", permission_loading: "Wait for saved permissions to finish loading.", permission_confirmation_required: "Confirm the ChatGPT access choice.", permission_settings_required: "Choose ChatGPT access settings."
  },
  de: {
    age_required: "Das Alter ist erforderlich.", age_range: "Das Alter muss eine ganze Zahl zwischen 16 und 100 sein.", height_range: "Die Größe muss zwischen 120 und 250 cm liegen.", weight_range: "Das aktuelle Gewicht muss zwischen 35 und 350 kg liegen.", goals_required: "Wähle mindestens ein Ziel.", primary_goal_required: "Wähle ein Hauptziel.", primary_goal_invalid: "Das Hauptziel muss zu den ausgewählten Zielen gehören.", target_weight_range: "Das Zielgewicht muss zwischen 35 und 350 kg liegen.", primary_sport_required: "Wähle eine primäre Sportart oder Aktivität.", custom_sport_required: "Gib die Sportart oder Aktivität ein.", experience_required: "Wähle ein Erfahrungsniveau.", location_required: "Wähle einen Trainingsort.", activity_required: "Wähle ein Aktivitätsniveau.", training_days_range: "Die Trainingstage pro Woche müssen zwischen 1 und 7 liegen.", available_days_required: "Wähle mindestens einen verfügbaren Tag.", session_duration_range: "Die Einheitsdauer muss zwischen 10 und 240 Minuten liegen.", preferred_time_required: "Wähle eine bevorzugte Trainingszeit.", sport_field_required: "Dieses sportartspezifische Feld ist erforderlich.", nutrition_goal_required: "Wähle ein Ernährungsziel.", meal_count_range: "Die tägliche Mahlzeitenanzahl muss zwischen 1 und 12 liegen.", cuisine_required: "Füge eine Küche hinzu oder wähle keine Präferenz.", cooking_time_range: "Die Kochzeit muss zwischen 0 und 1440 Minuten liegen.", budget_range: "Das wöchentliche Lebensmittelbudget muss mindestens null sein.", budget_currency_required: "Wähle eine Währung für das Lebensmittelbudget.", permission_load_failed: "Lade die gespeicherten Berechtigungen erneut, bevor du fortfährst.", permission_loading: "Warte, bis die gespeicherten Berechtigungen geladen sind.", permission_confirmation_required: "Bestätige die ChatGPT-Zugriffsauswahl.", permission_settings_required: "Wähle ChatGPT-Zugriffseinstellungen."
  },
  ar: {
    age_required: "العمر مطلوب.", age_range: "يجب أن يكون العمر رقمًا صحيحًا بين 16 و100.", height_range: "يجب أن يكون الطول بين 120 و250 سم.", weight_range: "يجب أن يكون الوزن الحالي بين 35 و350 كجم.", goals_required: "اختر هدفًا واحدًا على الأقل.", primary_goal_required: "اختر هدفًا رئيسيًا واحدًا.", primary_goal_invalid: "يجب أن يكون الهدف الرئيسي ضمن الأهداف المختارة.", target_weight_range: "يجب أن يكون الوزن المستهدف بين 35 و350 كجم.", primary_sport_required: "اختر الرياضة أو النشاط الرئيسي.", custom_sport_required: "أدخل اسم الرياضة أو النشاط.", experience_required: "اختر مستوى الخبرة.", location_required: "اختر مكان التدريب.", activity_required: "اختر مستوى النشاط.", training_days_range: "يجب أن يكون عدد أيام التدريب بين 1 و7.", available_days_required: "اختر يومًا متاحًا واحدًا على الأقل.", session_duration_range: "يجب أن تكون مدة الحصة بين 10 و240 دقيقة.", preferred_time_required: "اختر وقت التدريب المفضل.", sport_field_required: "هذا الحقل الخاص بالرياضة مطلوب.", nutrition_goal_required: "اختر هدف التغذية.", meal_count_range: "يجب أن يكون عدد الوجبات اليومي بين 1 و12.", cuisine_required: "أضف مطبخًا مفضلًا أو اختر لا تفضيل.", cooking_time_range: "يجب أن يكون وقت الطهي بين 0 و1440 دقيقة.", budget_range: "يجب ألا تقل ميزانية الطعام الأسبوعية عن صفر.", budget_currency_required: "اختر عملة ميزانية الطعام.", permission_load_failed: "أعد تحميل الصلاحيات المحفوظة قبل المتابعة.", permission_loading: "انتظر حتى يكتمل تحميل الصلاحيات المحفوظة.", permission_confirmation_required: "أكد اختيار صلاحيات ChatGPT.", permission_settings_required: "اختر إعدادات صلاحيات ChatGPT."
  }
};

export type OnboardingPermissionCopy = { label: string; readDescription: string; writeDescription: string };
const permissionCopy: Record<"en" | "de" | "ar", Record<AiPermissionSection, OnboardingPermissionCopy>> = {
  en: {
    workouts: { label: "Workouts", readDescription: "View workout plans, schedules, exercises, and history.", writeDescription: "Create or update plans and log workouts." }, nutrition: { label: "Nutrition", readDescription: "View food logs, calories, macros, and saved foods.", writeDescription: "Create or update nutrition logs." }, meal_plans: { label: "Meal plans", readDescription: "View planned meals and meal-plan items.", writeDescription: "Create or update meal plans." }, hydration: { label: "Hydration", readDescription: "View water goals and hydration history.", writeDescription: "Add or update hydration logs and goals." }, wellness: { label: "Wellness", readDescription: "View habits, sleep, recovery, supplements, and tasks.", writeDescription: "Create or update wellness records." }, progress: { label: "Progress", readDescription: "View progress records, measurements, and personal records.", writeDescription: "Add or update progress records." }, profile: { label: "Profile", readDescription: "View the fitness profile and preferences used for personalization.", writeDescription: "Update supported fitness-profile fields." }, settings: { label: "Settings", readDescription: "View supported Plaivra app settings.", writeDescription: "Update supported app settings; account security remains excluded." }
  },
  de: {
    workouts: { label: "Training", readDescription: "Trainingspläne, Termine, Übungen und Verlauf ansehen.", writeDescription: "Pläne erstellen oder aktualisieren und Training protokollieren." }, nutrition: { label: "Ernährung", readDescription: "Lebensmittelprotokolle, Kalorien, Makros und gespeicherte Lebensmittel ansehen.", writeDescription: "Ernährungsprotokolle erstellen oder aktualisieren." }, meal_plans: { label: "Essenspläne", readDescription: "Geplante Mahlzeiten und Einträge ansehen.", writeDescription: "Essenspläne erstellen oder aktualisieren." }, hydration: { label: "Flüssigkeit", readDescription: "Trinkziele und Verlauf ansehen.", writeDescription: "Trinkprotokolle und Ziele hinzufügen oder aktualisieren." }, wellness: { label: "Wohlbefinden", readDescription: "Gewohnheiten, Schlaf, Erholung, Supplemente und Aufgaben ansehen.", writeDescription: "Wohlbefindensdaten erstellen oder aktualisieren." }, progress: { label: "Fortschritt", readDescription: "Fortschritt, Messungen und persönliche Rekorde ansehen.", writeDescription: "Fortschrittsdaten hinzufügen oder aktualisieren." }, profile: { label: "Profil", readDescription: "Fitnessprofil und Präferenzen zur Personalisierung ansehen.", writeDescription: "Unterstützte Fitnessprofil-Felder aktualisieren." }, settings: { label: "Einstellungen", readDescription: "Unterstützte Plaivra-Einstellungen ansehen.", writeDescription: "Unterstützte App-Einstellungen aktualisieren; Kontosicherheit bleibt ausgeschlossen." }
  },
  ar: {
    workouts: { label: "التمارين", readDescription: "عرض خطط التمرين والجداول والتمارين والسجل.", writeDescription: "إنشاء الخطط أو تحديثها وتسجيل التمارين." }, nutrition: { label: "التغذية", readDescription: "عرض سجلات الطعام والسعرات والماكروز والأطعمة المحفوظة.", writeDescription: "إنشاء سجلات التغذية أو تحديثها." }, meal_plans: { label: "خطط الوجبات", readDescription: "عرض الوجبات المخططة وعناصر الخطة.", writeDescription: "إنشاء خطط الوجبات أو تحديثها." }, hydration: { label: "شرب المياه", readDescription: "عرض أهداف المياه وسجل الترطيب.", writeDescription: "إضافة سجلات المياه والأهداف أو تحديثها." }, wellness: { label: "العافية", readDescription: "عرض العادات والنوم والاستشفاء والمكملات والمهام.", writeDescription: "إنشاء بيانات العافية أو تحديثها." }, progress: { label: "التقدم", readDescription: "عرض سجلات التقدم والقياسات والأرقام الشخصية.", writeDescription: "إضافة سجلات التقدم أو تحديثها." }, profile: { label: "الملف", readDescription: "عرض الملف الرياضي والتفضيلات المستخدمة للتخصيص.", writeDescription: "تحديث حقول الملف الرياضي المدعومة." }, settings: { label: "الإعدادات", readDescription: "عرض إعدادات Plaivra المدعومة.", writeDescription: "تحديث إعدادات التطبيق المدعومة مع استبعاد أمان الحساب." }
  }
};

const reviewText: Record<"en" | "de" | "ar", ReviewText> = {
  en: { noValue: "Not provided", noneSelected: "None selected", yes: "Yes", no: "No", full: "Full", custom: "Custom", read: "View", readWrite: "View and create/update", primarySport: "Primary sport or activity", secondarySports: "Secondary sports or activities", primaryGoal: "Primary goal", goals: "Goals", targetWeight: "Target weight", age: "Age", sex: "Sex", height: "Height", currentWeight: "Current weight", experienceLevel: "Experience level", trainingLocation: "Training location", activityLevel: "Activity level", daysPerWeek: "Days per week", availableDays: "Available days", sessionDuration: "Session duration", preferredTime: "Preferred workout time", likedActivities: "Liked activities or exercises", dislikedActivities: "Disliked activities or exercises", nutritionGoal: "Nutrition goal", mealsPerDay: "Daily meal count", preferredCuisines: "Preferred cuisines", foodsLiked: "Foods liked", foodsDisliked: "Foods disliked", allergies: "Allergies", restrictions: "Dietary restrictions", cookingAbility: "Cooking ability", cookingTime: "Available cooking time", mealPrep: "Meal-prep preference", weeklyBudget: "Weekly food budget", eatingSchedule: "Eating schedule", supplements: "Supplements", tracksMacros: "Tracks calories or macros", injuries: "Injuries or limitations", painAreas: "Pain-sensitive areas", movementsAvoid: "Movements to avoid", discomfortExercises: "Exercises causing discomfort", mobilityLimits: "Mobility limitations", professionalRestrictions: "Professional restrictions", retainedNotes: "Earlier notes retained", accessMode: "Access mode", basicSummary: "Basic profile", goalsSummary: "Goals", trainingSummary: "Training", nutritionSummary: "Nutrition", constraintsSummary: "Physical constraints", permissionsSummary: "ChatGPT access" },
  de: { noValue: "Nicht angegeben", noneSelected: "Nichts ausgewählt", yes: "Ja", no: "Nein", full: "Voll", custom: "Benutzerdefiniert", read: "Ansehen", readWrite: "Ansehen und erstellen/aktualisieren", primarySport: "Primäre Sportart oder Aktivität", secondarySports: "Weitere Sportarten oder Aktivitäten", primaryGoal: "Hauptziel", goals: "Ziele", targetWeight: "Zielgewicht", age: "Alter", sex: "Geschlecht", height: "Größe", currentWeight: "Aktuelles Gewicht", experienceLevel: "Erfahrungsniveau", trainingLocation: "Trainingsort", activityLevel: "Aktivitätsniveau", daysPerWeek: "Tage pro Woche", availableDays: "Verfügbare Tage", sessionDuration: "Dauer pro Einheit", preferredTime: "Bevorzugte Trainingszeit", likedActivities: "Beliebte Aktivitäten oder Übungen", dislikedActivities: "Unbeliebte Aktivitäten oder Übungen", nutritionGoal: "Ernährungsziel", mealsPerDay: "Mahlzeiten pro Tag", preferredCuisines: "Bevorzugte Küchen", foodsLiked: "Beliebte Lebensmittel", foodsDisliked: "Unbeliebte Lebensmittel", allergies: "Allergien", restrictions: "Ernährungseinschränkungen", cookingAbility: "Kochkenntnisse", cookingTime: "Verfügbare Kochzeit", mealPrep: "Meal-Prep-Präferenz", weeklyBudget: "Wöchentliches Lebensmittelbudget", eatingSchedule: "Essenszeiten", supplements: "Supplemente", tracksMacros: "Trackt Kalorien oder Makros", injuries: "Verletzungen oder Einschränkungen", painAreas: "Schmerzempfindliche Bereiche", movementsAvoid: "Zu vermeidende Bewegungen", discomfortExercises: "Übungen mit Beschwerden", mobilityLimits: "Mobilitätseinschränkungen", professionalRestrictions: "Professionelle Vorgaben", retainedNotes: "Frühere Notizen", accessMode: "Zugriffsmodus", basicSummary: "Basisprofil", goalsSummary: "Ziele", trainingSummary: "Training", nutritionSummary: "Ernährung", constraintsSummary: "Körperliche Einschränkungen", permissionsSummary: "ChatGPT-Zugriff" },
  ar: { noValue: "غير مُدخل", noneSelected: "لا يوجد اختيار", yes: "نعم", no: "لا", full: "كامل", custom: "مخصص", read: "عرض", readWrite: "عرض وإنشاء/تحديث", primarySport: "الرياضة أو النشاط الرئيسي", secondarySports: "الرياضات أو الأنشطة الإضافية", primaryGoal: "الهدف الرئيسي", goals: "الأهداف", targetWeight: "الوزن المستهدف", age: "العمر", sex: "الجنس", height: "الطول", currentWeight: "الوزن الحالي", experienceLevel: "مستوى الخبرة", trainingLocation: "مكان التدريب", activityLevel: "مستوى النشاط", daysPerWeek: "الأيام أسبوعيًا", availableDays: "الأيام المتاحة", sessionDuration: "مدة الحصة", preferredTime: "وقت التدريب المفضل", likedActivities: "الأنشطة أو التمارين المفضلة", dislikedActivities: "الأنشطة أو التمارين غير المفضلة", nutritionGoal: "هدف التغذية", mealsPerDay: "عدد الوجبات اليومي", preferredCuisines: "المطابخ المفضلة", foodsLiked: "الأطعمة المفضلة", foodsDisliked: "الأطعمة غير المفضلة", allergies: "الحساسيات", restrictions: "القيود الغذائية", cookingAbility: "القدرة على الطهي", cookingTime: "وقت الطهي المتاح", mealPrep: "تفضيل تحضير الوجبات", weeklyBudget: "ميزانية الطعام الأسبوعية", eatingSchedule: "مواعيد الأكل", supplements: "المكملات", tracksMacros: "يتابع السعرات أو الماكروز", injuries: "الإصابات أو القيود", painAreas: "المناطق الحساسة للألم", movementsAvoid: "الحركات التي يجب تجنبها", discomfortExercises: "التمارين التي تسبب انزعاجًا", mobilityLimits: "قيود الحركة", professionalRestrictions: "قيود الطبيب أو العلاج الطبيعي", retainedNotes: "الملاحظات السابقة", accessMode: "نوع الصلاحية", basicSummary: "الملف الأساسي", goalsSummary: "الأهداف", trainingSummary: "التدريب", nutritionSummary: "التغذية", constraintsSummary: "القيود الجسدية", permissionsSummary: "صلاحيات ChatGPT" }
};

export function translateValidationIssue(locale: "en" | "de" | "ar", issue: ValidationIssue, fieldLabel?: string) {
  const base = validationMessages[locale][issue.code];
  if (issue.code === "sport_field_required" && fieldLabel) {
    if (locale === "de") return `${fieldLabel} ist erforderlich.`;
    if (locale === "ar") return `${fieldLabel} مطلوب.`;
    return `${fieldLabel} is required.`;
  }
  return base;
}

export function onboardingPermissionCopy(locale: "en" | "de" | "ar", section: AiPermissionSection) {
  return permissionCopy[locale][section];
}

export function onboardingOptionLabel(locale: "en" | "de" | "ar", value: string) {
  return optionLabels[locale][value] ?? value;
}

export function useOnboardingTranslation() {
  const { language, dir } = useTranslation();
  const locale: "en" | "de" | "ar" = language === "de" || language === "ar" ? language : "en";
  const dictionary = dictionaries[locale];
  return useMemo(() => ({
    language: locale,
    dir,
    ot: (key: Key) => dictionary[key],
    goalLabel: (value: keyof typeof GOAL_LABELS.en) => GOAL_LABELS[locale][value],
    sportLabel: (value: keyof typeof SPORT_LABELS.en) => SPORT_LABELS[locale][value],
    fieldLabel: (id: string, fallback: string) => fieldLabels[locale][id] || fallback,
    optionLabel: (value: string) => onboardingOptionLabel(locale, value),
    dayLabel: (value: string) => dayLabels[locale][value] || value,
    permissionLabel: (section: AiPermissionSection) => permissionCopy[locale][section].label,
    permissionDescription: (section: AiPermissionSection, action: "read" | "write") => action === "write" ? permissionCopy[locale][section].writeDescription : permissionCopy[locale][section].readDescription,
    validationMessage: (issue: ValidationIssue) => translateValidationIssue(locale, issue, issue.fieldId ? fieldLabels[locale][issue.fieldId] || fieldLabels.en[issue.fieldId] : undefined),
    reviewText: reviewText[locale]
  }), [dictionary, dir, locale]);
}
