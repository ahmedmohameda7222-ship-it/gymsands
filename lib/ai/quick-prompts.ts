import type { AiPermissionSection } from "@/types";

export type PromptLanguage = "en" | "de" | "ar";
export type PromptCategory = "training" | "nutrition" | "grocery" | "recovery" | "progress" | "daily" | "profile";
export type PromptCapability = "read" | "write";
export type PromptSourceState = "loading" | "loaded" | "failed" | "unknown";
export type LocalizedText = Record<PromptLanguage, string>;
export const PROMPT_CATEGORIES: PromptCategory[] = ["training", "nutrition", "grocery", "recovery", "progress", "daily", "profile"];

export type QuickPromptContext = {
  route?: string;
  today?: string;
  localHour?: number;
  units?: { energy?: "kcal" | "kJ"; liquid?: "ml" | "oz"; weight?: "kg" | "lb" };
  workout?: { hasPlan?: boolean; scheduled?: boolean; active?: boolean; completed?: boolean; title?: string | null; exerciseCount?: number | null; durationMinutes?: number | null; historyCount?: number | null };
  nutrition?: { hasTargets?: boolean; targetsState?: PromptSourceState; foodLogsState?: "loading" | "loaded" | "failed"; remainingCalories?: number | null; remainingProtein?: number | null; foodLogCount: number | null; mealPlanCount: number | null };
  grocery?: { state?: PromptSourceState; itemCount: number | null };
  hydration?: { state?: PromptSourceState; hasTarget?: boolean; logCount?: number | null; remainingMl?: number | null };
  recovery?: { state?: PromptSourceState; hasData?: boolean; sleepHours?: number | null; poorRecovery?: boolean };
  wellness?: { state?: PromptSourceState; habitCount?: number | null; supplementCount?: number | null };
  progress?: { state?: PromptSourceState; entryCount?: number | null };
  profile?: { state?: PromptSourceState; hasGoals?: boolean; hasTrainingPreferences?: boolean; hasNutritionPreferences?: boolean; hasConstraints?: boolean };
  selection?: { exercise?: string | null; meal?: string | null };
  endOfWeek?: boolean;
};

export type PromptPrerequisite = { id: string; message: LocalizedText; isMet: (context: QuickPromptContext) => boolean };
export type QuickPromptDefinition = {
  id: string;
  category: PromptCategory;
  title: LocalizedText;
  description: LocalizedText;
  role: LocalizedText;
  objective: LocalizedText;
  capability: PromptCapability;
  permissionSections: AiPermissionSection[];
  destination?: LocalizedText;
  attachmentExpected?: boolean;
  quick?: boolean;
  prerequisites: PromptPrerequisite[];
  supportedBy: readonly string[];
  eligible: (context: QuickPromptContext) => boolean;
  priority: (context: QuickPromptContext) => number;
  contextChips: (context: QuickPromptContext, language: PromptLanguage) => string[];
  buildPrompt: (context: QuickPromptContext, language: PromptLanguage) => string;
  template: (context: QuickPromptContext, language: PromptLanguage) => string;
};
export type PromptAvailability = { available: boolean; missingContext: string[] };
export type PromptHomeSections = { recommended: QuickPromptDefinition | null; quick: QuickPromptDefinition[]; dynamic: QuickPromptDefinition[] };

const l = (en: string, de: string, ar: string): LocalizedText => ({ en, de, ar });
const v = (entry: LocalizedText, language: PromptLanguage) => entry[language];

const roles: Record<PromptCategory, LocalizedText> = {
  training: l("Act as an experienced strength and conditioning coach.", "Handle als erfahrener Kraft- und Konditionstrainer.", "تصرّف كمدرب قوة ولياقة بدنية خبير."),
  nutrition: l("Act as a practical sports nutrition planner.", "Handle als praxisnaher Planer für Sporternährung.", "تصرّف كمخطط عملي للتغذية الرياضية."),
  grocery: l("Act as a practical grocery and meal-preparation planner.", "Handle als praxisnaher Einkaufs- und Meal-Prep-Planer.", "تصرّف كمخطط عملي للتسوق وتحضير الوجبات."),
  recovery: l("Act as a recovery and habit coach, not a medical professional.", "Handle als Erholungs- und Gewohnheitscoach, nicht als medizinische Fachkraft.", "تصرّف كمدرب للتعافي والعادات، وليس كمتخصص طبي."),
  progress: l("Act as a fitness progress and adherence analyst.", "Handle als Analyst für Fitnessfortschritt und Planumsetzung.", "تصرّف كمحلل لتقدم اللياقة والالتزام بالخطة."),
  daily: l("Act as a practical daily execution coach.", "Handle als praxisnaher Coach für die tägliche Umsetzung.", "تصرّف كمدرب عملي لتنفيذ مهام اليوم."),
  profile: l("Act as a fitness profile and preference coach.", "Handle als Coach für Fitnessprofil und Präferenzen.", "تصرّف كمدرب للملف الشخصي وتفضيلات اللياقة.")
};

const prerequisiteMessages: Record<string, LocalizedText> = {
  always: l("Available now", "Jetzt verfügbar", "متاح الآن"),
  noWorkoutPlan: l("Requires no saved workout plan", "Erfordert, dass noch kein Trainingsplan gespeichert ist", "يتطلب عدم وجود خطة تمرين محفوظة"),
  workoutPlan: l("Requires a saved workout plan", "Erfordert einen gespeicherten Trainingsplan", "يتطلب خطة تمرين محفوظة"),
  scheduledWorkout: l("Requires a scheduled or active workout", "Erfordert ein geplantes oder aktives Training", "يتطلب تمرينًا مجدولًا أو نشطًا"),
  workoutHistory: l("Requires recent workout history", "Erfordert einen aktuellen Trainingsverlauf", "يتطلب سجل تمارين حديثًا"),
  selectedExercise: l("Requires a selected exercise", "Erfordert eine ausgewählte Übung", "يتطلب تمرينًا محددًا"),
  knownMacros: l("Requires available food logs and nutrition targets", "Erfordert verfügbare Ernährungsprotokolle und Ziele", "يتطلب سجلات طعام وأهداف تغذية متاحة"),
  foodLogsKnown: l("Requires available food-log data", "Erfordert verfügbare Ernährungsprotokolle", "يتطلب بيانات سجل طعام متاحة"),
  nutritionTargets: l("Requires nutrition targets", "Erfordert Ernährungsziele", "يتطلب أهداف تغذية"),
  nutritionPreferences: l("Requires saved nutrition preferences", "Erfordert gespeicherte Ernährungspräferenzen", "يتطلب تفضيلات تغذية محفوظة"),
  noMealPlan: l("Requires no saved meal plan", "Erfordert, dass kein Mahlzeitenplan gespeichert ist", "يتطلب عدم وجود خطة وجبات محفوظة"),
  mealPlan: l("Requires a saved meal plan", "Erfordert einen gespeicherten Mahlzeitenplan", "يتطلب خطة وجبات محفوظة"),
  selectedMeal: l("Requires a selected planned meal", "Erfordert eine ausgewählte geplante Mahlzeit", "يتطلب وجبة مخططة محددة"),
  groceryItems: l("Requires saved grocery items", "Erfordert gespeicherte Einkaufsartikel", "يتطلب عناصر تسوق محفوظة"),
  hydrationKnown: l("Requires available hydration data", "Erfordert verfügbare Hydrationsdaten", "يتطلب بيانات ترطيب متاحة"),
  recoveryData: l("Requires recovery or sleep data", "Erfordert Erholungs- oder Schlafdaten", "يتطلب بيانات تعافٍ أو نوم"),
  wellnessData: l("Requires wellness tracking data", "Erfordert Wohlbefindensdaten", "يتطلب بيانات تتبع العافية"),
  progressData: l("Requires recent progress data", "Erfordert aktuelle Fortschrittsdaten", "يتطلب بيانات تقدم حديثة"),
  progressOrHistory: l("Requires recent progress or workout history", "Erfordert aktuellen Fortschritt oder Trainingsverlauf", "يتطلب تقدمًا حديثًا أو سجل تمارين"),
  dailyContext: l("Requires available Today context", "Erfordert verfügbaren Heute-Kontext", "يتطلب سياق اليوم المتاح"),
  goals: l("Requires saved goals", "Erfordert gespeicherte Ziele", "يتطلب أهدافًا محفوظة"),
  trainingPreferences: l("Requires saved training preferences", "Erfordert gespeicherte Trainingspräferenzen", "يتطلب تفضيلات تدريب محفوظة"),
  constraints: l("Requires saved physical constraints", "Erfordert gespeicherte körperliche Einschränkungen", "يتطلب قيودًا بدنية محفوظة")
};

function prerequisiteMet(id: string, c: QuickPromptContext) {
  const known = (state?: PromptSourceState) => state === "loaded";
  const checks: Record<string, boolean> = {
    always: true,
    noWorkoutPlan: known(c.profile?.state) && c.workout?.hasPlan === false,
    workoutPlan: c.workout?.hasPlan === true,
    scheduledWorkout: Boolean(c.workout?.scheduled || c.workout?.active),
    workoutHistory: (c.workout?.historyCount ?? 0) > 0 || c.workout?.completed === true,
    selectedExercise: Boolean(c.selection?.exercise),
    knownMacros: c.nutrition?.foodLogsState === "loaded" && c.nutrition?.targetsState === "loaded" && c.nutrition?.hasTargets === true,
    foodLogsKnown: c.nutrition?.foodLogsState === "loaded",
    nutritionTargets: c.nutrition?.targetsState === "loaded" && c.nutrition?.hasTargets === true,
    nutritionPreferences: c.profile?.hasNutritionPreferences === true,
    noMealPlan: c.nutrition?.mealPlanCount === 0,
    mealPlan: (c.nutrition?.mealPlanCount ?? 0) > 0,
    selectedMeal: Boolean(c.selection?.meal),
    groceryItems: c.grocery?.state === "loaded" && (c.grocery.itemCount ?? 0) > 0,
    hydrationKnown: c.hydration?.state === "loaded",
    recoveryData: c.recovery?.state === "loaded" && c.recovery?.hasData === true,
    wellnessData: c.wellness?.state === "loaded" && ((c.wellness.habitCount ?? 0) > 0 || (c.wellness.supplementCount ?? 0) > 0),
    progressData: c.progress?.state === "loaded" && (c.progress.entryCount ?? 0) > 0,
    progressOrHistory: (c.progress?.state === "loaded" && (c.progress.entryCount ?? 0) > 0) || (c.workout?.historyCount ?? 0) > 0,
    dailyContext: [c.nutrition?.foodLogsState, c.nutrition?.targetsState, c.grocery?.state, c.hydration?.state, c.recovery?.state, c.wellness?.state, c.progress?.state, c.profile?.state].some((state) => state === "loaded"),
    goals: c.profile?.hasGoals === true,
    trainingPreferences: c.profile?.hasTrainingPreferences === true,
    constraints: c.profile?.hasConstraints === true
  };
  return checks[id] ?? false;
}

function contextLines(c: QuickPromptContext, language: PromptLanguage) {
  const labels = {
    en: { date: "Date", workout: "Workout", state: "Workout state", plan: "Saved workout plan", history: "Completed workouts", targets: "Nutrition targets", nutrition: "Today nutrition progress", foodUnknown: "Food-log data is unavailable; do not treat it as zero", meals: "Saved meal-plan items", grocery: "Saved grocery items", groceryUnknown: "Grocery data is unavailable", hydration: "Hydration remaining", hydrationUnknown: "Hydration data is unavailable", recovery: "Recovery context", recoveryUnknown: "Recovery data is unavailable", progress: "Progress entries", goals: "Saved goals", training: "Training preferences", foodPrefs: "Nutrition preferences", constraints: "Physical constraints", exercise: "Selected exercise", meal: "Selected meal" },
    de: { date: "Datum", workout: "Training", state: "Trainingsstatus", plan: "Gespeicherter Trainingsplan", history: "Abgeschlossene Trainings", targets: "Ernährungsziele", nutrition: "Heutiger Ernährungsfortschritt", foodUnknown: "Ernährungsprotokoll ist nicht verfügbar; nicht als null behandeln", meals: "Gespeicherte Mahlzeiten", grocery: "Gespeicherte Einkaufsartikel", groceryUnknown: "Einkaufsdaten sind nicht verfügbar", hydration: "Verbleibende Flüssigkeit", hydrationUnknown: "Hydrationsdaten sind nicht verfügbar", recovery: "Erholungskontext", recoveryUnknown: "Erholungsdaten sind nicht verfügbar", progress: "Fortschrittseinträge", goals: "Gespeicherte Ziele", training: "Trainingspräferenzen", foodPrefs: "Ernährungspräferenzen", constraints: "Körperliche Einschränkungen", exercise: "Ausgewählte Übung", meal: "Ausgewählte Mahlzeit" },
    ar: { date: "التاريخ", workout: "التمرين", state: "حالة التمرين", plan: "خطة التمرين المحفوظة", history: "التمارين المكتملة", targets: "أهداف التغذية", nutrition: "تقدم التغذية اليوم", foodUnknown: "بيانات سجل الطعام غير متاحة؛ لا تعتبرها صفرًا", meals: "وجبات الخطة المحفوظة", grocery: "عناصر التسوق المحفوظة", groceryUnknown: "بيانات التسوق غير متاحة", hydration: "الماء المتبقي", hydrationUnknown: "بيانات الترطيب غير متاحة", recovery: "سياق التعافي", recoveryUnknown: "بيانات التعافي غير متاحة", progress: "سجلات التقدم", goals: "الأهداف المحفوظة", training: "تفضيلات التدريب", foodPrefs: "تفضيلات التغذية", constraints: "القيود البدنية", exercise: "التمرين المحدد", meal: "الوجبة المحددة" }
  }[language];
  const lines: string[] = [];
  if (c.today) lines.push(`- ${labels.date}: ${c.today}`);
  if (c.workout?.title) lines.push(`- ${labels.workout}: ${c.workout.title}`);
  if (c.workout) lines.push(`- ${labels.state}: ${c.workout.active ? "active" : c.workout.completed ? "completed" : c.workout.scheduled ? "scheduled" : "not scheduled"}`);
  if (c.workout?.hasPlan != null) lines.push(`- ${labels.plan}: ${c.workout.hasPlan ? "available" : "not available"}`);
  if (c.workout?.historyCount != null) lines.push(`- ${labels.history}: ${c.workout.historyCount}`);
  if (c.nutrition?.hasTargets != null) lines.push(`- ${labels.targets}: ${c.nutrition.hasTargets ? "available" : "not available"}`);
  if (c.nutrition?.foodLogsState === "failed") lines.push(`- ${labels.foodUnknown}`);
  else if (c.nutrition?.foodLogsState === "loaded") lines.push(`- ${labels.nutrition}: ${c.nutrition.foodLogCount ?? 0} logs; ${Math.max(0, Math.round(c.nutrition.remainingCalories ?? 0))} kcal and ${Math.max(0, Math.round(c.nutrition.remainingProtein ?? 0))} g protein remaining`);
  if (c.nutrition?.mealPlanCount != null) lines.push(`- ${labels.meals}: ${c.nutrition.mealPlanCount}`);
  if (c.grocery?.state === "failed") lines.push(`- ${labels.groceryUnknown}`);
  else if (c.grocery?.itemCount != null) lines.push(`- ${labels.grocery}: ${c.grocery.itemCount}`);
  if (c.hydration?.state === "failed") lines.push(`- ${labels.hydrationUnknown}`);
  else if (c.hydration?.remainingMl != null) lines.push(`- ${labels.hydration}: ${Math.max(0, Math.round(c.hydration.remainingMl))} ml`);
  if (c.recovery?.state === "failed") lines.push(`- ${labels.recoveryUnknown}`);
  else if (c.recovery?.hasData) lines.push(`- ${labels.recovery}: ${c.recovery.poorRecovery ? "low recovery or high fatigue" : `${c.recovery.sleepHours ?? "known"} hours sleep`}`);
  if (c.progress?.entryCount != null) lines.push(`- ${labels.progress}: ${c.progress.entryCount}`);
  if (c.profile?.hasGoals) lines.push(`- ${labels.goals}: available`);
  if (c.profile?.hasTrainingPreferences) lines.push(`- ${labels.training}: available`);
  if (c.profile?.hasNutritionPreferences) lines.push(`- ${labels.foodPrefs}: available`);
  if (c.profile?.hasConstraints) lines.push(`- ${labels.constraints}: available`);
  if (c.selection?.exercise) lines.push(`- ${labels.exercise}: ${c.selection.exercise}`);
  if (c.selection?.meal) lines.push(`- ${labels.meal}: ${c.selection.meal}`);
  return lines;
}

const sectionCopy = {
  en: { role: "Role", objective: "Objective", context: "Authorized Plaivra context", constraints: "Constraints", output: "Required output", confirmation: "Confirmation rule", noContext: "- No additional authorized context is currently available. State what is missing instead of inventing it.", constraintsBody: ["Use only the minimum authorized Plaivra context required for this task.", "Respect saved language, units, preferences, schedule and physical constraints.", "Do not invent missing data, equipment, foods, progress or health information.", "State assumptions and uncertainty clearly.", "Do not diagnose medical conditions or recommend treatment or supplement doses."], outputBody: ["Give a concise summary first.", "Provide a structured practical recommendation.", "Prefer the smallest useful set of changes.", "Explain why each recommendation is useful.", "End with clear next actions."], read: ["Do not change any Plaivra data."], write: ["Show the complete proposed changes first.", "Do not save or update anything in Plaivra until I explicitly confirm.", "After confirmation, use only the authorized Plaivra tool required for the approved change and do not claim success until the tool confirms it."] },
  de: { role: "Rolle", objective: "Ziel", context: "Autorisierter Plaivra-Kontext", constraints: "Rahmenbedingungen", output: "Erwartete Ausgabe", confirmation: "Bestätigungsregel", noContext: "- Aktuell ist kein zusätzlicher autorisierter Kontext verfügbar. Nenne Fehlendes, statt es zu erfinden.", constraintsBody: ["Nutze nur den minimal erforderlichen autorisierten Plaivra-Kontext.", "Beachte Sprache, Einheiten, Präferenzen, Zeitplan und körperliche Einschränkungen.", "Erfinde keine fehlenden Daten, Geräte, Lebensmittel, Fortschritte oder Gesundheitsinformationen.", "Kennzeichne Annahmen und Unsicherheit klar.", "Stelle keine medizinischen Diagnosen und gib keine Behandlungs- oder Dosierungsempfehlungen."], outputBody: ["Beginne mit einer kurzen Zusammenfassung.", "Gib eine strukturierte praktische Empfehlung.", "Bevorzuge die kleinste sinnvolle Menge an Änderungen.", "Erkläre den Nutzen jeder Empfehlung.", "Beende mit klaren nächsten Schritten."], read: ["Ändere keine Plaivra-Daten."], write: ["Zeige zuerst alle vorgeschlagenen Änderungen vollständig.", "Speichere oder aktualisiere nichts in Plaivra, bis ich ausdrücklich bestätige.", "Nutze nach der Bestätigung nur das autorisierte Plaivra-Tool und behaupte keinen Erfolg, bevor das Tool ihn bestätigt."] },
  ar: { role: "الدور", objective: "الهدف", context: "سياق Plaivra المصرح به", constraints: "القيود", output: "المخرجات المطلوبة", confirmation: "قاعدة التأكيد", noContext: "- لا يتوفر حاليًا سياق إضافي مصرح به. اذكر ما ينقص بدلًا من اختراعه.", constraintsBody: ["استخدم الحد الأدنى فقط من سياق Plaivra المصرح به لهذه المهمة.", "احترم اللغة والوحدات والتفضيلات والجدول والقيود البدنية المحفوظة.", "لا تخترع بيانات أو معدات أو أطعمة أو تقدمًا أو معلومات صحية مفقودة.", "اذكر الافتراضات وعدم اليقين بوضوح.", "لا تشخّص حالات طبية ولا توصِ بعلاج أو جرعات مكملات."], outputBody: ["ابدأ بملخص قصير.", "قدّم توصية عملية ومنظمة.", "فضّل أصغر مجموعة تغييرات مفيدة.", "اشرح فائدة كل توصية.", "اختم بخطوات تالية واضحة."], read: ["لا تغيّر أي بيانات في Plaivra."], write: ["اعرض التغييرات المقترحة كاملة أولًا.", "لا تحفظ أو تحدّث أي شيء في Plaivra حتى أؤكد صراحة.", "بعد التأكيد استخدم فقط أداة Plaivra المصرح بها للتغيير المعتمد ولا تدّع النجاح حتى تؤكده الأداة."] }
} as const;

function buildProfessionalPrompt(definition: QuickPromptDefinition, context: QuickPromptContext, language: PromptLanguage) {
  const copy = sectionCopy[language];
  const contextBlock = contextLines(context, language);
  const photoRules = definition.attachmentExpected ? (language === "de"
    ? ["Plaivra lädt oder speichert das Bild nicht; ich hänge es direkt in ChatGPT an.", "Berücksichtige versteckte Öle, Soßen, Füllungen, Portionsgrößen und Zubereitungsarten.", "Protokolliere nichts, bis ich die Schätzung ausdrücklich bestätige."]
    : language === "ar"
      ? ["لا يرفع Plaivra الصورة ولا يخزنها؛ سأرفقها مباشرة في ChatGPT.", "راعِ عدم اليقين بسبب الزيوت والصلصات والحشوات والحصص وطرق الطهي غير الظاهرة.", "لا تسجل شيئًا حتى أؤكد التقدير صراحة."]
      : ["Plaivra does not upload or store the image; I will attach it directly in ChatGPT.", "Acknowledge hidden oils, sauces, fillings, portions and cooking methods.", "Log nothing until I explicitly confirm the estimate."]) : [];
  const constraints = [...copy.constraintsBody, ...photoRules];
  const confirmation = definition.capability === "write" ? copy.write : copy.read;
  return [
    `${copy.role}:\n${v(definition.role, language)}`,
    `${copy.objective}:\n${v(definition.objective, language)}`,
    `${copy.context}:\n${contextBlock.length ? contextBlock.join("\n") : copy.noContext}`,
    `${copy.constraints}:\n${constraints.map((item) => `- ${item}`).join("\n")}`,
    `${copy.output}:\n${copy.outputBody.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    `${copy.confirmation}:\n${confirmation.map((item) => `- ${item}`).join("\n")}`
  ].join("\n\n");
}

function p(
  id: string,
  category: PromptCategory,
  title: LocalizedText,
  objective: LocalizedText,
  capability: PromptCapability,
  permissionSections: AiPermissionSection[],
  supportedBy: string[],
  prerequisiteId: string,
  quick: boolean,
  basePriority: number
): QuickPromptDefinition {
  const prerequisite: PromptPrerequisite = { id: prerequisiteId, message: prerequisiteMessages[prerequisiteId], isMet: (context) => prerequisiteMet(prerequisiteId, context) };
  const definition = {
    id, category, title, description: objective, role: roles[category], objective, capability, permissionSections,
    destination: capability === "write" ? title : undefined,
    attachmentExpected: id === "estimate-meal-photo",
    quick, prerequisites: prerequisiteId === "always" ? [] : [prerequisite],
    supportedBy,
    eligible: (context: QuickPromptContext) => prerequisite.isMet(context),
    priority: (context: QuickPromptContext) => {
      let score = basePriority;
      if (id === "adjust-today-workout" && context.workout?.active) score += 20;
      if (id === "review-recovery" && context.recovery?.poorRecovery) score += 20;
      if (id === "review-week" && context.endOfWeek) score += 18;
      if (id === "finish-macros" && (context.nutrition?.remainingProtein ?? 0) > 40) score += 12;
      if (id === "estimate-meal-photo" && context.nutrition?.foodLogsState === "loaded" && context.nutrition.foodLogCount === 0) score += 12;
      return score;
    },
    contextChips: (context: QuickPromptContext, language: PromptLanguage) => contextLines(context, language).slice(0, 5).map((line) => line.replace(/^-\s*/, "")),
    buildPrompt: (_context: QuickPromptContext, _language: PromptLanguage) => "",
    template: (_context: QuickPromptContext, _language: PromptLanguage) => ""
  } satisfies QuickPromptDefinition;
  definition.buildPrompt = (context, language) => buildProfessionalPrompt(definition, context, language);
  definition.template = definition.buildPrompt;
  return definition;
}

export const QUICK_PROMPTS: QuickPromptDefinition[] = [
  p("create-workout-plan", "training", l("Create a workout plan", "Trainingsplan erstellen", "أنشئ خطة تمرين"), l("Create a realistic progressive workout plan from my authorized goals, schedule, equipment and constraints.", "Erstelle aus meinen autorisierten Zielen, meinem Zeitplan, den Geräten und Einschränkungen einen realistischen progressiven Trainingsplan.", "أنشئ خطة تمرين واقعية ومتدرجة من أهدافي وجدولي ومعداتي وقيودي المصرح بها."), "write", ["workouts", "profile"], ["get_training_planning_context", "create_custom_workout_plan"], "noWorkoutPlan", true, 86),
  p("adjust-today-workout", "training", l("Adjust today's workout", "Heutiges Training anpassen", "عدّل تمرين اليوم"), l("Adapt today's scheduled workout while preserving the plan's purpose.", "Passe das heutige geplante Training an und erhalte den Zweck des Plans.", "عدّل تمرين اليوم المجدول مع الحفاظ على هدف الخطة."), "write", ["workouts"], ["get_workout_adjustment_context", "update_plan_exercise", "adjust_next_workout"], "scheduledWorkout", false, 105),
  p("lighter-workout", "training", l("Make today lighter", "Heutiges Training leichter machen", "خفّف تمرين اليوم"), l("Create the smallest safe reduction in today's workout based on authorized readiness context.", "Erstelle anhand des autorisierten Bereitschaftskontexts die kleinste sinnvolle Reduktion des heutigen Trainings.", "أنشئ أصغر تخفيف عملي لتمرين اليوم بناءً على سياق الاستعداد المصرح به."), "write", ["workouts", "wellness"], ["get_daily_execution_context", "update_plan_exercise", "adjust_for_low_readiness", "reduce_workout_volume", "reduce_workout_intensity", "recovery_workout", "reduce_next_session"], "scheduledWorkout", false, 100),
  p("replace-exercise", "training", l("Replace an exercise", "Übung ersetzen", "استبدل تمرينًا"), l("Replace the selected exercise with a practical alternative that preserves its training intent.", "Ersetze die ausgewählte Übung durch eine praktische Alternative mit demselben Trainingszweck.", "استبدل التمرين المحدد ببديل عملي يحافظ على هدفه التدريبي."), "write", ["workouts"], ["get_workout_adjustment_context", "create_exercise_alternative", "update_plan_exercise", "replace_exercise"], "selectedExercise", false, 82),
  p("review-last-workout", "training", l("Review my last workout", "Mein letztes Training prüfen", "راجع آخر تمرين"), l("Review my most recent completed workout and identify the smallest useful next steps.", "Prüfe mein zuletzt abgeschlossenes Training und nenne die kleinsten sinnvollen nächsten Schritte.", "راجع آخر تمرين مكتمل وحدد أصغر الخطوات المفيدة التالية."), "read", ["workouts"], ["get_progress_context", "review_workout_session"], "workoutHistory", false, 91),
  p("explain-progression", "training", l("Explain my progression", "Meine Progression erklären", "اشرح تقدمي التدريبي"), l("Explain my next training progression from recent performance without inventing targets.", "Erkläre meine nächste Trainingsprogression aus der letzten Leistung, ohne Ziele zu erfinden.", "اشرح خطوة التدرج التالية من أدائي الأخير دون اختراع أهداف."), "read", ["workouts", "progress"], ["get_progress_context", "get_progression_targets", "explain_progression"], "workoutHistory", false, 66),
  p("plan-next-workout", "training", l("Plan my next workout", "Nächstes Training planen", "خطط لتمريناتي القادمة"), l("Plan the next practical session from my authorized plan, history and constraints.", "Plane die nächste praktische Einheit aus meinem autorisierten Plan, Verlauf und meinen Einschränkungen.", "خطط للحصة العملية التالية من خطتي وسجلي وقيودي المصرح بها."), "read", ["workouts"], ["get_training_planning_context", "get_progress_context"], "workoutPlan", false, 64),
  p("review-workout-consistency", "training", l("Review workout consistency", "Trainingskonstanz prüfen", "راجع انتظام التمرين"), l("Review recent workout adherence and identify one realistic consistency improvement.", "Prüfe die letzte Trainingsumsetzung und nenne eine realistische Verbesserung der Konstanz.", "راجع الالتزام الأخير بالتمرين وحدد تحسينًا واقعيًا واحدًا للانتظام."), "read", ["workouts", "progress"], ["get_progress_context"], "workoutHistory", false, 58),
  p("suggest-warmup", "training", l("Suggest a warm-up", "Aufwärmen vorschlagen", "اقترح إحماءً"), l("Suggest a concise warm-up for the scheduled workout, equipment and constraints.", "Schlage ein kurzes Aufwärmen für das geplante Training, die Geräte und Einschränkungen vor.", "اقترح إحماءً مختصرًا للتمرين المجدول والمعدات والقيود."), "read", ["workouts", "profile"], ["get_training_planning_context", "get_today_workout"], "scheduledWorkout", true, 55),
  p("adapt-equipment", "training", l("Adapt training to my equipment", "Training an Geräte anpassen", "كيّف التدريب مع معداتي"), l("Adapt the scheduled workout to the equipment actually available while preserving intent.", "Passe das geplante Training an die tatsächlich verfügbaren Geräte an und erhalte den Zweck.", "كيّف التمرين المجدول مع المعدات المتاحة فعليًا مع الحفاظ على الهدف."), "write", ["workouts", "profile"], ["get_workout_adjustment_context", "update_plan_exercise"], "scheduledWorkout", false, 60),
  p("adapt-time", "training", l("Adapt training to available time", "Training an verfügbare Zeit anpassen", "كيّف التدريب مع الوقت المتاح"), l("Fit the scheduled workout into my available time with the smallest useful changes.", "Passe das geplante Training mit den kleinsten sinnvollen Änderungen an meine verfügbare Zeit an.", "اجعل التمرين المجدول مناسبًا للوقت المتاح بأصغر تغييرات مفيدة."), "write", ["workouts", "profile"], ["get_workout_adjustment_context", "update_plan_exercise"], "scheduledWorkout", false, 63),
  p("finish-macros", "nutrition", l("Help me finish today's macros", "Heutige Makros vervollständigen", "ساعدني على إكمال ماكروز اليوم"), l("Suggest realistic foods for my known remaining calories and protein.", "Schlage realistische Lebensmittel für meine bekannten verbleibenden Kalorien und Proteine vor.", "اقترح أطعمة واقعية للسعرات والبروتين المتبقيين المعروفين."), "read", ["nutrition"], ["get_daily_execution_context", "get_today_calories"], "knownMacros", true, 88),
  p("estimate-meal-photo", "nutrition", l("Estimate meal from photo", "Mahlzeit aus Foto schätzen", "قدّر الوجبة من الصورة"), l("Estimate visible portions, calories and macros from the photo I will attach in ChatGPT.", "Schätze sichtbare Portionen, Kalorien und Makros aus dem Foto, das ich in ChatGPT anhänge.", "قدّر الحصص والسعرات والماكروز الظاهرة من الصورة التي سأرفقها في ChatGPT."), "read", [], ["search_foods"], "always", true, 72),
  p("plan-rest-meals", "nutrition", l("Plan the rest of today's meals", "Restliche Mahlzeiten heute planen", "خطط لبقية وجبات اليوم"), l("Plan the remaining meals around my known targets, food logs and preferences.", "Plane die restlichen Mahlzeiten anhand meiner bekannten Ziele, Protokolle und Präferenzen.", "خطط للوجبات المتبقية وفق أهدافي وسجلاتي وتفضيلاتي المعروفة."), "read", ["nutrition", "meal_plans"], ["get_daily_execution_context", "get_nutrition_planning_context"], "knownMacros", true, 75),
  p("create-meal-plan", "nutrition", l("Create a meal plan", "Mahlzeitenplan erstellen", "أنشئ خطة وجبات"), l("Create a practical meal plan that respects targets, preferences, allergies, budget and cooking limits.", "Erstelle einen praktischen Mahlzeitenplan unter Beachtung von Zielen, Präferenzen, Allergien, Budget und Kochzeit.", "أنشئ خطة وجبات عملية تحترم الأهداف والتفضيلات والحساسيات والميزانية ووقت الطهي."), "write", ["nutrition", "meal_plans"], ["get_nutrition_planning_context", "create_day_meal_plan", "create_week_meal_plan", "build_meal_plan"], "noMealPlan", true, 84),
  p("adjust-meal-plan", "nutrition", l("Adjust my meal plan", "Mahlzeitenplan anpassen", "عدّل خطة وجباتي"), l("Adjust the saved meal plan with the smallest useful changes while preserving targets and preferences.", "Passe den gespeicherten Mahlzeitenplan mit den kleinsten sinnvollen Änderungen an und erhalte Ziele und Präferenzen.", "عدّل خطة الوجبات المحفوظة بأصغر تغييرات مفيدة مع الحفاظ على الأهداف والتفضيلات."), "write", ["nutrition", "meal_plans"], ["get_meal_plan_for_week", "update_meal_plan_item", "regenerate_meal", "make_meal_dairy_free", "make_meal_gluten_free", "make_meal_cuisine"], "mealPlan", false, 68),
  p("replace-meal", "nutrition", l("Replace a planned meal", "Geplante Mahlzeit ersetzen", "استبدل وجبة مخططة"), l("Replace the selected planned meal while respecting targets, preferences and allergies.", "Ersetze die ausgewählte geplante Mahlzeit unter Beachtung von Zielen, Präferenzen und Allergien.", "استبدل الوجبة المخططة المحددة مع احترام الأهداف والتفضيلات والحساسيات."), "write", ["nutrition", "meal_plans"], ["get_meal_plan_for_date", "update_meal_plan_item", "replace_meal_ingredient"], "selectedMeal", false, 62),
  p("cheaper-meal", "nutrition", l("Suggest a cheaper meal", "Günstigere Mahlzeit vorschlagen", "اقترح وجبة أرخص"), l("Create a lower-cost alternative that remains practical and close to the meal's nutrition intent.", "Erstelle eine günstigere Alternative, die praktisch bleibt und dem Ernährungsziel nahekommt.", "أنشئ بديلًا أقل تكلفة يظل عمليًا وقريبًا من الهدف الغذائي للوجبة."), "read", ["nutrition"], ["get_nutrition_planning_context", "make_meal_cheaper"], "nutritionPreferences", false, 48),
  p("high-protein-option", "nutrition", l("Suggest a high-protein option", "Proteinreiche Option vorschlagen", "اقترح خيارًا عالي البروتين"), l("Suggest a practical high-protein option that fits my authorized nutrition context.", "Schlage eine praktische proteinreiche Option passend zu meinem autorisierten Ernährungskontext vor.", "اقترح خيارًا عمليًا عالي البروتين يناسب سياق التغذية المصرح به."), "read", ["nutrition"], ["get_nutrition_planning_context", "make_meal_higher_protein"], "nutritionTargets", true, 57),
  p("review-week-nutrition", "nutrition", l("Review this week's nutrition", "Ernährung dieser Woche prüfen", "راجع تغذية هذا الأسبوع"), l("Review known nutrition adherence and identify the smallest useful improvement.", "Prüfe die bekannte Ernährungsumsetzung und nenne die kleinste sinnvolle Verbesserung.", "راجع الالتزام الغذائي المعروف وحدد أصغر تحسين مفيد."), "read", ["nutrition", "progress"], ["get_progress_context", "get_nutrition_planning_context"], "foodLogsKnown", false, 52),
  p("review-hydration", "nutrition", l("Review hydration", "Hydration prüfen", "راجع الترطيب"), l("Review known hydration progress and suggest a practical remainder for today.", "Prüfe den bekannten Hydrationsfortschritt und schlage einen praktischen Rest für heute vor.", "راجع تقدم الترطيب المعروف واقترح خطة عملية لبقية اليوم."), "read", ["hydration"], ["get_water_summary"], "hydrationKnown", true, 54),
  p("meal-prep-plan", "nutrition", l("Create a meal-preparation plan", "Meal-Prep-Plan erstellen", "أنشئ خطة تحضير وجبات"), l("Create a practical preparation workflow from my saved meal plan, schedule and cooking limits.", "Erstelle einen praktischen Vorbereitungsablauf aus meinem Mahlzeitenplan, Zeitplan und Kochgrenzen.", "أنشئ سير عمل عمليًا لتحضير الوجبات من خطتي وجدولي وقيود الطهي."), "read", ["nutrition", "meal_plans"], ["get_nutrition_planning_context", "get_meal_plan_for_week", "make_meal_faster"], "mealPlan", false, 47),
  p("build-grocery-list", "grocery", l("Build my grocery list", "Einkaufsliste erstellen", "أنشئ قائمة تسوقي"), l("Build a deduplicated ingredient-level grocery list from the saved meal plan.", "Erstelle aus dem gespeicherten Mahlzeitenplan eine deduplizierte Einkaufsliste auf Zutatenebene.", "أنشئ قائمة تسوق بالمكونات دون تكرار من خطة الوجبات المحفوظة."), "write", ["meal_plans"], ["get_meal_plan_for_week", "generate_shopping_list", "upsert_grocery_item", "build_grocery_list"], "mealPlan", false, 80),
  p("review-grocery-list", "grocery", l("Review my grocery list", "Einkaufsliste prüfen", "راجع قائمة تسوقي"), l("Review the saved grocery list for missing, duplicate or impractical items.", "Prüfe die gespeicherte Einkaufsliste auf fehlende, doppelte oder unpraktische Artikel.", "راجع قائمة التسوق المحفوظة للعناصر الناقصة أو المكررة أو غير العملية."), "read", ["meal_plans"], ["get_grocery_items"], "groceryItems", false, 49),
  p("reduce-grocery-cost", "grocery", l("Reduce grocery cost", "Einkaufskosten senken", "قلّل تكلفة التسوق"), l("Suggest the smallest cost reductions that preserve meal-plan practicality and nutrition intent.", "Schlage die kleinsten Kostensenkungen vor, die Praxistauglichkeit und Ernährungsziel erhalten.", "اقترح أصغر تخفيضات للتكلفة تحافظ على عملية الخطة وهدفها الغذائي."), "read", ["meal_plans", "nutrition"], ["get_grocery_items", "get_nutrition_planning_context"], "groceryItems", false, 46),
  p("group-grocery-sections", "grocery", l("Group items by store section", "Nach Ladenbereich gruppieren", "جمّع العناصر حسب قسم المتجر"), l("Group the known grocery items by practical store section without changing quantities.", "Gruppiere die bekannten Einkaufsartikel nach sinnvollen Ladenbereichen, ohne Mengen zu ändern.", "جمّع عناصر التسوق المعروفة حسب أقسام المتجر دون تغيير الكميات."), "read", ["meal_plans"], ["get_grocery_items"], "groceryItems", false, 42),
  p("review-recovery", "recovery", l("Review my recovery", "Meine Erholung prüfen", "راجع تعافيّي"), l("Review known sleep, fatigue and wellness context without medical diagnosis.", "Prüfe bekannten Schlaf-, Müdigkeits- und Wohlbefindenskontext ohne medizinische Diagnose.", "راجع سياق النوم والإرهاق والعافية المعروف دون تشخيص طبي."), "read", ["wellness", "workouts"], ["get_sleep_recovery_summary", "get_daily_execution_context"], "recoveryData", true, 90),
  p("train-today", "recovery", l("Should I train today?", "Soll ich heute trainieren?", "هل أتدرب اليوم؟"), l("Give a cautious practical training recommendation from authorized readiness and schedule context.", "Gib aus autorisiertem Bereitschafts- und Zeitplankontext eine vorsichtige praktische Trainingsempfehlung.", "قدّم توصية تدريبية عملية وحذرة من سياق الاستعداد والجدول المصرح به."), "read", ["wellness", "workouts"], ["get_daily_execution_context", "get_sleep_recovery_summary"], "recoveryData", true, 67),
  p("reduce-stress", "recovery", l("Help me reduce stress today", "Stress heute reduzieren", "ساعدني على تقليل التوتر اليوم"), l("Suggest a small non-medical stress-reduction plan that fits today's schedule.", "Schlage einen kleinen nicht-medizinischen Plan zur Stressreduktion passend zum heutigen Zeitplan vor.", "اقترح خطة صغيرة غير طبية لتقليل التوتر تناسب جدول اليوم."), "read", ["wellness"], ["get_daily_execution_context"], "wellnessData", false, 50),
  p("review-sleep", "recovery", l("Review my sleep pattern", "Schlafmuster prüfen", "راجع نمط نومي"), l("Review available sleep patterns and practical fitness implications without diagnosis.", "Prüfe verfügbare Schlafmuster und praktische Fitness-Auswirkungen ohne Diagnose.", "راجع أنماط النوم المتاحة وآثارها العملية على اللياقة دون تشخيص."), "read", ["wellness"], ["get_sleep_recovery_summary"], "recoveryData", false, 45),
  p("review-habits", "recovery", l("Review my habits", "Gewohnheiten prüfen", "راجع عاداتي"), l("Review tracked habit completion and identify one realistic improvement.", "Prüfe die Erledigung getrackter Gewohnheiten und nenne eine realistische Verbesserung.", "راجع إكمال العادات المتتبعة وحدد تحسينًا واقعيًا واحدًا."), "read", ["wellness"], ["get_habits"], "wellnessData", false, 44),
  p("review-supplements", "recovery", l("Review supplement adherence", "Supplement-Umsetzung prüfen", "راجع الالتزام بالمكملات"), l("Review recorded supplement adherence without recommending a dose or medical treatment.", "Prüfe die protokollierte Supplement-Umsetzung ohne Dosierungs- oder Behandlungsempfehlung.", "راجع الالتزام المسجل بالمكملات دون توصية بجرعة أو علاج طبي."), "read", ["wellness"], ["get_today_supplements"], "wellnessData", false, 40),
  p("review-week", "progress", l("Review my week", "Meine Woche prüfen", "راجع أسبوعي"), l("Review authorized weekly training, nutrition, hydration and recovery patterns and identify the smallest useful improvements.", "Prüfe autorisierte wöchentliche Muster bei Training, Ernährung, Hydration und Erholung und nenne die kleinsten sinnvollen Verbesserungen.", "راجع أنماط التدريب والتغذية والترطيب والتعافي الأسبوعية المصرح بها وحدد أصغر التحسينات المفيدة."), "read", ["workouts", "nutrition", "hydration", "wellness", "progress"], ["get_progress_context", "review_week", "rebalance_week"], "progressOrHistory", true, 78),
  p("explain-progress", "progress", l("Explain my progress", "Meinen Fortschritt erklären", "اشرح تقدمي"), l("Explain known progress trends, uncertainty and the next useful measurement or action.", "Erkläre bekannte Fortschrittstrends, Unsicherheit und die nächste sinnvolle Messung oder Aktion.", "اشرح اتجاهات التقدم المعروفة وعدم اليقين والقياس أو الإجراء المفيد التالي."), "read", ["progress", "workouts", "nutrition"], ["get_progress_context"], "progressData", false, 61),
  p("improve-next-week", "progress", l("What should I improve next week?", "Was soll ich nächste Woche verbessern?", "ماذا أحسن الأسبوع القادم؟"), l("Choose the single highest-value realistic improvement for next week from authorized history.", "Wähle aus dem autorisierten Verlauf die eine wertvollste realistische Verbesserung für nächste Woche.", "اختر التحسين الواقعي الأعلى قيمة للأسبوع القادم من السجل المصرح به."), "read", ["progress", "workouts", "nutrition", "wellness"], ["get_progress_context"], "progressOrHistory", true, 59),
  p("review-consistency", "progress", l("Review my consistency", "Meine Konstanz prüfen", "راجع استمراريتي"), l("Review adherence across known training and tracking records without treating missing data as failure.", "Prüfe die Umsetzung in bekannten Trainings- und Trackingdaten, ohne fehlende Daten als Misserfolg zu werten.", "راجع الالتزام عبر سجلات التدريب والتتبع المعروفة دون اعتبار البيانات المفقودة فشلًا."), "read", ["progress", "workouts", "nutrition", "wellness"], ["get_progress_context"], "progressOrHistory", false, 53),
  p("identify-plateau", "progress", l("Identify a plateau", "Plateau erkennen", "حدد ثبات التقدم"), l("Assess whether known recent records support a possible plateau and state uncertainty clearly.", "Prüfe, ob bekannte aktuelle Daten auf ein mögliches Plateau hindeuten, und kennzeichne Unsicherheit klar.", "قيّم ما إذا كانت السجلات الأخيرة المعروفة تدعم احتمال ثبات التقدم واذكر عدم اليقين بوضوح."), "read", ["progress", "workouts"], ["get_progress_context"], "progressData", false, 43),
  p("plan-rest-day", "daily", l("Plan the rest of my day", "Den Rest meines Tages planen", "خطط لبقية يومي"), l("Prioritize the smallest useful remaining actions from today's authorized context.", "Priorisiere die kleinsten sinnvollen verbleibenden Aktionen aus dem heutigen autorisierten Kontext.", "رتّب أصغر الإجراءات المفيدة المتبقية من سياق اليوم المصرح به."), "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", true, 70),
  p("what-next", "daily", l("What should I do next?", "Was soll ich als Nächstes tun?", "ماذا أفعل الآن؟"), l("Choose one next action from known current-day execution state and explain why.", "Wähle eine nächste Aktion aus dem bekannten heutigen Umsetzungsstand und erkläre warum.", "اختر إجراءً تاليًا واحدًا من حالة تنفيذ اليوم المعروفة واشرح السبب."), "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", true, 65),
  p("catch-up", "daily", l("Catch me up", "Bring mich auf den Stand", "لخّص وضعي"), l("Summarize what is active, complete, unavailable and most useful next today.", "Fasse zusammen, was heute aktiv, abgeschlossen, nicht verfügbar und als Nächstes sinnvoll ist.", "لخّص ما هو نشط ومكتمل وغير متاح وما هو الأكثر فائدة تاليًا اليوم."), "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", true, 56),
  p("prioritize-incomplete", "daily", l("Prioritize today's incomplete actions", "Heutige offene Aktionen priorisieren", "رتّب إجراءات اليوم غير المكتملة"), l("Prioritize only known incomplete actions without treating failed sources as empty.", "Priorisiere nur bekannte offene Aktionen, ohne fehlgeschlagene Quellen als leer zu behandeln.", "رتّب الإجراءات غير المكتملة المعروفة فقط دون اعتبار المصادر الفاشلة فارغة."), "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", false, 51),
  p("end-day-plan", "daily", l("Build an end-of-day plan", "Plan für den Tagesabschluss erstellen", "أنشئ خطة لنهاية اليوم"), l("Build a realistic concise plan for the remaining time today from known context.", "Erstelle aus bekanntem Kontext einen realistischen kurzen Plan für die verbleibende Zeit heute.", "أنشئ خطة واقعية ومختصرة للوقت المتبقي اليوم من السياق المعروف."), "read", ["nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", false, 48),
  p("review-goals", "profile", l("Review my goals", "Meine Ziele prüfen", "راجع أهدافي"), l("Review saved goals for clarity and consistency without changing them.", "Prüfe gespeicherte Ziele auf Klarheit und Konsistenz, ohne sie zu ändern.", "راجع الأهداف المحفوظة من حيث الوضوح والاتساق دون تغييرها."), "read", ["profile"], ["get_training_planning_context"], "goals", false, 39),
  p("update-training-preferences", "profile", l("Update training preferences", "Trainingspräferenzen aktualisieren", "حدّث تفضيلات التدريب"), l("Propose explicit updates to my training preferences from my stated request.", "Schlage aus meiner ausdrücklichen Anfrage klare Aktualisierungen meiner Trainingspräferenzen vor.", "اقترح تحديثات صريحة لتفضيلات التدريب بناءً على طلبي المعلن."), "write", ["profile", "settings"], ["get_training_planning_context", "update_training_goal"], "trainingPreferences", false, 38),
  p("update-nutrition-preferences", "profile", l("Update nutrition preferences", "Ernährungspräferenzen aktualisieren", "حدّث تفضيلات التغذية"), l("Propose explicit updates to saved food, cooking and budget preferences.", "Schlage klare Aktualisierungen gespeicherter Lebensmittel-, Koch- und Budgetpräferenzen vor.", "اقترح تحديثات صريحة لتفضيلات الطعام والطهي والميزانية المحفوظة."), "write", ["nutrition", "profile", "settings"], ["get_nutrition_preference_profile", "update_nutrition_preference_profile"], "nutritionPreferences", false, 38),
  p("review-constraints", "profile", l("Review physical constraints", "Körperliche Einschränkungen prüfen", "راجع القيود البدنية"), l("Summarize user-authored physical constraints for training planning without medical interpretation.", "Fasse nutzerverfasste körperliche Einschränkungen für die Trainingsplanung ohne medizinische Interpretation zusammen.", "لخّص القيود البدنية التي أدخلها المستخدم لتخطيط التدريب دون تفسير طبي."), "read", ["profile", "workouts"], ["get_training_planning_context"], "constraints", false, 37),
];

export function localizePrompt(definition: QuickPromptDefinition, language: PromptLanguage) {
  return { title: v(definition.title, language), description: v(definition.description, language) };
}

export function getPromptAvailability(definition: QuickPromptDefinition, context: QuickPromptContext, language: PromptLanguage): PromptAvailability {
  const missingContext = definition.prerequisites.filter((item) => !item.isMet(context)).map((item) => v(item.message, language));
  return { available: missingContext.length === 0, missingContext };
}

export function rankQuickPrompts(context: QuickPromptContext) {
  return QUICK_PROMPTS.filter((prompt) => prompt.eligible(context)).sort((a, b) => b.priority(context) - a.priority(context) || a.id.localeCompare(b.id));
}

export function getPromptHomeSections(context: QuickPromptContext): PromptHomeSections {
  const ranked = rankQuickPrompts(context);
  const recommended = ranked[0] ?? null;
  const used = new Set(recommended ? [recommended.id] : []);
  const quick = ranked.filter((item) => item.quick && !used.has(item.id)).slice(0, 6);
  quick.forEach((item) => used.add(item.id));
  const dynamic = ranked.filter((item) => !used.has(item.id)).slice(0, 5);
  return { recommended, quick, dynamic };
}

export function filterPromptLibrary({
  prompts = QUICK_PROMPTS,
  category,
  search,
  language
}: {
  prompts?: QuickPromptDefinition[];
  category?: PromptCategory | "all";
  search?: string;
  language: PromptLanguage;
}) {
  const query = search?.trim().toLocaleLowerCase(language === "ar" ? "ar" : language === "de" ? "de-DE" : "en") ?? "";
  return prompts.filter((prompt) => {
    if (category && category !== "all" && prompt.category !== category) return false;
    if (!query) return true;
    const localized = localizePrompt(prompt, language);
    return `${localized.title} ${localized.description}`.toLocaleLowerCase().includes(query);
  });
}
