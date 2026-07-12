import type { PromptCategory, PromptLanguage, PromptPrerequisite, PromptSourceState, QuickPromptContext, LocalizedText } from "@/lib/ai/quick-prompts";

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
  knownMacros: l("Requires available food logs and complete nutrition targets", "Erfordert verfügbare Ernährungsprotokolle und vollständige Ziele", "يتطلب سجلات طعام وأهداف تغذية كاملة ومتاحة"),
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
const availabilityMessages = {
  targetsLoading: l("Nutrition targets are still loading", "Ernährungsziele werden noch geladen", "أهداف التغذية ما زالت قيد التحميل"),
  targetsUnavailable: l("Nutrition targets could not be loaded", "Ernährungsziele konnten nicht geladen werden", "تعذّر تحميل أهداف التغذية"),
  targetsNotConfigured: l("Requires nutrition targets", "Erfordert eingerichtete Ernährungsziele", "يتطلب إعداد أهداف التغذية"),
  foodLogsLoading: l("Food logs are still loading", "Ernährungsprotokolle werden noch geladen", "سجلات الطعام ما زالت قيد التحميل"),
  foodLogsUnavailable: l("Food logs could not be loaded", "Ernährungsprotokolle konnten nicht geladen werden", "تعذّر تحميل سجلات الطعام")
};

function prerequisiteMet(id: string, c: QuickPromptContext) {
  const loaded = (state?: PromptSourceState) => state === "loaded";
  const checks: Record<string, boolean> = {
    always: true,
    noWorkoutPlan: loaded(c.profile?.state) && c.workout?.hasPlan === false,
    workoutPlan: c.workout?.hasPlan === true,
    scheduledWorkout: Boolean(c.workout?.scheduled || c.workout?.active),
    workoutHistory: (c.workout?.historyCount ?? 0) > 0 || c.workout?.completed === true,
    selectedExercise: Boolean(c.selection?.exercise),
    knownMacros: c.nutrition?.foodLogsState === "loaded"
      && c.nutrition?.targetsState === "loaded"
      && c.nutrition?.hasTargets === true
      && typeof c.nutrition.remainingCalories === "number"
      && typeof c.nutrition.remainingProtein === "number"
      && typeof c.nutrition.remainingCarbs === "number"
      && typeof c.nutrition.remainingFat === "number",
    foodLogsKnown: c.nutrition?.foodLogsState === "loaded",
    nutritionTargets: c.nutrition?.targetsState === "loaded" && c.nutrition?.hasTargets === true,
    nutritionPreferences: c.profile?.state === "loaded" && c.profile?.hasNutritionPreferences === true,
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
    goals: c.profile?.state === "loaded" && c.profile?.hasGoals === true,
    trainingPreferences: c.profile?.state === "loaded" && c.profile?.hasTrainingPreferences === true,
    constraints: c.profile?.state === "loaded" && c.profile?.hasConstraints === true
  };
  return checks[id] ?? false;
}

function prerequisiteMessage(id: string, context: QuickPromptContext, language: PromptLanguage) {
  const nutrition = context.nutrition;
  if (id === "knownMacros") {
    if (nutrition?.foodLogsState === "failed") return v(availabilityMessages.foodLogsUnavailable, language);
    if (nutrition?.targetsState === "failed") return v(availabilityMessages.targetsUnavailable, language);
    if (nutrition?.targetsState === "loaded" && nutrition.hasTargets !== true) return v(availabilityMessages.targetsNotConfigured, language);
    if (nutrition?.foodLogsState === "loading") return v(availabilityMessages.foodLogsLoading, language);
    if (nutrition?.targetsState === "loading" || nutrition?.targetsState === "unknown") return v(availabilityMessages.targetsLoading, language);
  }
  if (id === "nutritionTargets") {
    if (nutrition?.targetsState === "failed") return v(availabilityMessages.targetsUnavailable, language);
    if (nutrition?.targetsState === "loading" || nutrition?.targetsState === "unknown") return v(availabilityMessages.targetsLoading, language);
    if (nutrition?.targetsState === "loaded" && nutrition.hasTargets !== true) return v(availabilityMessages.targetsNotConfigured, language);
  }
  if (id === "foodLogsKnown") {
    if (nutrition?.foodLogsState === "failed") return v(availabilityMessages.foodLogsUnavailable, language);
    if (nutrition?.foodLogsState === "loading") return v(availabilityMessages.foodLogsLoading, language);
  }
  return v(prerequisiteMessages[id], language);
}

export function getPromptRole(category: PromptCategory) { return roles[category]; }
export function createPromptPrerequisite(id: string): PromptPrerequisite { return { id, message: prerequisiteMessages[id], isMet: (context) => prerequisiteMet(id, context) }; }
export function getPromptPrerequisiteMessage(id: string, context: QuickPromptContext, language: PromptLanguage) { return prerequisiteMessage(id, context, language); }
