import type { AiPermissionSection } from "@/types";

export type PromptLanguage = "en" | "de" | "ar";
export type PromptCategory = "training" | "nutrition" | "recovery" | "progress" | "daily";
export type PromptCapability = "read" | "write";
export type LocalizedText = Record<PromptLanguage, string>;

export type QuickPromptContext = {
  route?: string;
  today?: string;
  workout?: { scheduled: boolean; active: boolean; completed: boolean; title?: string | null; exerciseCount?: number; durationMinutes?: number | null };
  nutrition?: { hasTargets: boolean; remainingCalories?: number | null; remainingProtein?: number | null; foodLogCount: number; mealPlanCount: number };
  grocery?: { itemCount: number };
  recovery?: { sleepHours?: number | null; poorRecovery: boolean };
  endOfWeek?: boolean;
};

export type QuickPromptDefinition = {
  id: string;
  category: PromptCategory;
  title: LocalizedText;
  description: LocalizedText;
  template: (context: QuickPromptContext, language: PromptLanguage) => string;
  permissionSections: AiPermissionSection[];
  capability: PromptCapability;
  attachmentExpected?: boolean;
  destination?: LocalizedText;
  eligible: (context: QuickPromptContext) => boolean;
  priority: (context: QuickPromptContext) => number;
  contextChips: (context: QuickPromptContext, language: PromptLanguage) => string[];
};

const text = (en: string, de: string, ar: string): LocalizedText => ({ en, de, ar });
const value = (entry: LocalizedText, language: PromptLanguage) => entry[language];
const always = () => true;
const none = () => [];

const photoPrompt = text(
  `I am about to eat the meal in the photo I will attach.\n\nIdentify the visible foods and estimate:\n- portion sizes\n- calories\n- protein\n- carbohydrates\n- fat\n\nGive me your best estimate and a reasonable range when uncertain. Mention ingredients that cannot be confirmed from the photo, such as oil, sauces, fillings, or cooking methods.\n\nDo not save or log anything to Plaivra until I confirm the estimate.`,
  `Ich werde gleich die Mahlzeit auf dem Foto essen, das ich anhängen werde.\n\nErkenne die sichtbaren Lebensmittel und schätze:\n- Portionsgrößen\n- Kalorien\n- Protein\n- Kohlenhydrate\n- Fett\n\nGib deine beste Schätzung und bei Unsicherheit einen sinnvollen Bereich an. Nenne Zutaten, die auf dem Foto nicht bestätigt werden können, zum Beispiel Öl, Soßen, Füllungen oder die Zubereitungsart.\n\nSpeichere oder protokolliere nichts in Plaivra, bis ich die Schätzung bestätige.`,
  `أنا على وشك تناول الوجبة الموجودة في الصورة التي سأرفقها.\n\nحدّد الأطعمة الظاهرة وقدّر:\n- أحجام الحصص\n- السعرات الحرارية\n- البروتين\n- الكربوهيدرات\n- الدهون\n\nقدّم أفضل تقدير لديك ونطاقًا معقولًا عند عدم اليقين. اذكر المكونات التي لا يمكن تأكيدها من الصورة مثل الزيت أو الصلصات أو الحشوات أو طريقة الطهي.\n\nلا تحفظ أو تسجل أي شيء في Plaivra حتى أؤكد التقدير.`
);

export const QUICK_PROMPTS: QuickPromptDefinition[] = [
  {
    id: "review-week", category: "progress",
    title: text("Review my week", "Meine Woche prüfen", "راجع أسبوعي"),
    description: text("Review recent activity and identify the smallest useful improvements for next week.", "Prüfe meine letzten Aktivitäten und nenne die kleinsten sinnvollen Verbesserungen für nächste Woche.", "راجع نشاطي الأخير وحدد أصغر التحسينات المفيدة للأسبوع القادم."),
    template: (c, l) => value(text("Review my Plaivra activity from this week. Explain what went well, what was inconsistent, and the smallest useful changes for next week. Do not change any Plaivra data.", "Prüfe meine Plaivra-Aktivitäten dieser Woche. Erkläre, was gut lief, was unbeständig war und welche kleinen Änderungen nächste Woche sinnvoll sind. Ändere keine Plaivra-Daten.", "راجع نشاطي في Plaivra خلال هذا الأسبوع. اشرح ما سار جيدًا وما كان غير منتظم وأصغر التغييرات المفيدة للأسبوع القادم. لا تغيّر أي بيانات في Plaivra."), l),
    permissionSections: ["workouts", "nutrition", "wellness", "progress"], capability: "read", eligible: always,
    priority: c => c.endOfWeek ? 95 : 45, contextChips: none
  },
  {
    id: "adjust-today-workout", category: "training",
    title: text("Adjust today's workout", "Heutiges Training anpassen", "عدّل تمرين اليوم"),
    description: text("Adapt today's scheduled workout without replacing the full plan.", "Passe das heutige Training an, ohne den ganzen Plan zu ersetzen.", "عدّل تمرين اليوم المجدول دون استبدال الخطة كاملة."),
    template: (c, l) => value(text(`Adjust today's scheduled workout${c.workout?.title ? ` (${c.workout.title})` : ""}. Keep the plan's intent, explain each change, and only save changes after I confirm them.`, `Passe das heutige geplante Training${c.workout?.title ? ` (${c.workout.title})` : ""} an. Behalte die Absicht des Plans bei, erkläre jede Änderung und speichere erst nach meiner Bestätigung.`, `عدّل تمرين اليوم المجدول${c.workout?.title ? ` (${c.workout.title})` : ""}. حافظ على هدف الخطة واشرح كل تغيير ولا تحفظ التغييرات إلا بعد تأكيدي.`), l),
    permissionSections: ["workouts"], capability: "write", destination: text("Workout Plan", "Trainingsplan", "خطة التمرين"),
    eligible: c => Boolean(c.workout?.scheduled || c.workout?.active), priority: c => c.workout?.active ? 110 : c.workout?.scheduled ? 105 : 0,
    contextChips: (c, l) => c.workout?.title ? [value(text("Today's workout", "Heutiges Training", "تمرين اليوم"), l), c.workout.title] : []
  },
  {
    id: "finish-macros", category: "nutrition",
    title: text("Help me finish today's macros", "Heutige Makros vervollständigen", "ساعدني على إكمال ماكروز اليوم"),
    description: text("Suggest practical foods for the calories and protein still remaining.", "Schlage praktische Lebensmittel für die verbleibenden Kalorien und das Protein vor.", "اقترح أطعمة عملية للسعرات والبروتين المتبقيين."),
    template: (c, l) => value(text(`Help me finish today's nutrition targets. I have about ${Math.max(0, Math.round(c.nutrition?.remainingCalories ?? 0))} kcal and ${Math.max(0, Math.round(c.nutrition?.remainingProtein ?? 0))} g protein remaining. Suggest a few realistic options. Do not log anything until I confirm.`, `Hilf mir, meine heutigen Ernährungsziele zu erreichen. Es bleiben ungefähr ${Math.max(0, Math.round(c.nutrition?.remainingCalories ?? 0))} kcal und ${Math.max(0, Math.round(c.nutrition?.remainingProtein ?? 0))} g Protein. Schlage einige realistische Optionen vor. Protokolliere nichts ohne meine Bestätigung.`, `ساعدني على إكمال أهداف التغذية اليوم. يتبقى تقريبًا ${Math.max(0, Math.round(c.nutrition?.remainingCalories ?? 0))} سعرة و${Math.max(0, Math.round(c.nutrition?.remainingProtein ?? 0))} غ بروتين. اقترح عدة خيارات واقعية ولا تسجل شيئًا قبل تأكيدي.`), l),
    permissionSections: ["nutrition"], capability: "read", eligible: c => Boolean(c.nutrition?.hasTargets && (c.nutrition.remainingProtein ?? 0) > 10),
    priority: c => Math.min(100, 60 + Math.round((c.nutrition?.remainingProtein ?? 0) / 2)),
    contextChips: (c, l) => [`${Math.max(0, Math.round(c.nutrition?.remainingProtein ?? 0))} g ${value(text("protein remaining", "Protein übrig", "بروتين متبقٍ"), l)}`]
  },
  {
    id: "plan-rest-day", category: "daily",
    title: text("Plan the rest of my day", "Den Rest meines Tages planen", "خطط لبقية يومي"),
    description: text("Prioritize the next useful actions from today's authorized context.", "Priorisiere die nächsten sinnvollen Schritte aus dem heutigen autorisierten Kontext.", "رتّب الخطوات المفيدة التالية من سياق اليوم المصرح به."),
    template: (c, l) => value(text("Plan the rest of my day using only my authorized Plaivra context. Prioritize the smallest useful next actions for training, meals, hydration, and recovery. Do not change any data.", "Plane den Rest meines Tages nur mit meinem autorisierten Plaivra-Kontext. Priorisiere die kleinsten sinnvollen nächsten Schritte für Training, Mahlzeiten, Flüssigkeit und Erholung. Ändere keine Daten.", "خطط لبقية يومي باستخدام سياق Plaivra المصرح به فقط. رتّب أصغر الخطوات المفيدة للتدريب والوجبات والترطيب والتعافي. لا تغيّر أي بيانات."), l),
    permissionSections: ["workouts", "nutrition", "hydration", "wellness"], capability: "read", eligible: always, priority: () => 55, contextChips: none
  },
  {
    id: "estimate-meal-photo", category: "nutrition",
    title: text("Estimate meal from photo", "Mahlzeit aus Foto schätzen", "قدّر الوجبة من الصورة"),
    description: text("Take or upload a photo in ChatGPT and estimate calories and macros.", "Nimm in ChatGPT ein Foto auf oder lade es hoch und schätze Kalorien und Makros.", "التقط صورة أو ارفعها في ChatGPT وقدّر السعرات والماكروز."),
    template: (_c, l) => value(photoPrompt, l), permissionSections: [], capability: "read", attachmentExpected: true,
    eligible: always, priority: c => c.nutrition?.foodLogCount === 0 ? 75 : 35, contextChips: none
  },
  {
    id: "review-recovery", category: "recovery",
    title: text("Review my recovery", "Meine Erholung prüfen", "راجع تعافيّي"),
    description: text("Review sleep and wellness context without diagnosing a condition.", "Prüfe Schlaf und Wohlbefinden ohne medizinische Diagnose.", "راجع النوم والعافية دون تشخيص حالة طبية."),
    template: (c, l) => value(text(`Review my recent recovery context${c.recovery?.sleepHours ? `, including about ${c.recovery.sleepHours} hours of sleep` : ""}. Explain practical training and recovery implications without diagnosing a medical condition.`, `Prüfe meinen aktuellen Erholungskontext${c.recovery?.sleepHours ? `, einschließlich etwa ${c.recovery.sleepHours} Stunden Schlaf` : ""}. Erkläre praktische Auswirkungen auf Training und Erholung ohne medizinische Diagnose.`, `راجع سياق التعافي الأخير${c.recovery?.sleepHours ? ` بما في ذلك نحو ${c.recovery.sleepHours} ساعات نوم` : ""}. اشرح الآثار العملية على التدريب والتعافي دون تشخيص طبي.`), l),
    permissionSections: ["wellness", "workouts"], capability: "read", eligible: c => Boolean(c.recovery?.sleepHours || c.recovery?.poorRecovery), priority: c => c.recovery?.poorRecovery ? 100 : 52,
    contextChips: (c, l) => c.recovery?.sleepHours ? [`${c.recovery.sleepHours} h ${value(text("sleep", "Schlaf", "نوم"), l)}`] : []
  },
  {
    id: "build-grocery-list", category: "nutrition",
    title: text("Build my grocery list", "Meine Einkaufsliste erstellen", "أنشئ قائمة تسوقي"),
    description: text("Create an ingredient-level list from the saved meal plan.", "Erstelle aus dem gespeicherten Mahlzeitenplan eine Zutatenliste.", "أنشئ قائمة مكونات من خطة الوجبات المحفوظة."),
    template: (_c, l) => value(text("Build an ingredient-level grocery list from my authorized saved meal plan. Group it by store section and avoid duplicates. Show the proposed list before saving it to Plaivra.", "Erstelle aus meinem autorisierten gespeicherten Mahlzeitenplan eine Einkaufsliste auf Zutatenebene. Gruppiere sie nach Ladenbereich und vermeide Duplikate. Zeige die Liste vor dem Speichern in Plaivra.", "أنشئ قائمة تسوق على مستوى المكونات من خطة الوجبات المحفوظة والمصرح بها. جمّعها حسب قسم المتجر وتجنب التكرار واعرض القائمة المقترحة قبل حفظها في Plaivra."), l),
    permissionSections: ["meal_plans"], capability: "write", destination: text("Grocery List", "Einkaufsliste", "قائمة التسوق"),
    eligible: c => Boolean((c.nutrition?.mealPlanCount ?? 0) > 0 && (c.grocery?.itemCount ?? 0) === 0), priority: () => 88, contextChips: none
  },
  {
    id: "create-meal-plan", category: "nutrition",
    title: text("Create a meal plan", "Mahlzeitenplan erstellen", "أنشئ خطة وجبات"),
    description: text("Create a practical plan from authorized nutrition preferences.", "Erstelle einen praktischen Plan aus autorisierten Ernährungspräferenzen.", "أنشئ خطة عملية من تفضيلات التغذية المصرح بها."),
    template: (_c, l) => value(text("Create a practical meal plan using my authorized Plaivra nutrition preferences and targets. Show the complete proposal before saving anything.", "Erstelle einen praktischen Mahlzeitenplan aus meinen autorisierten Plaivra-Ernährungspräferenzen und Zielen. Zeige den vollständigen Vorschlag, bevor etwas gespeichert wird.", "أنشئ خطة وجبات عملية باستخدام تفضيلات وأهداف التغذية المصرح بها في Plaivra. اعرض الاقتراح كاملًا قبل حفظ أي شيء."), l),
    permissionSections: ["nutrition", "meal_plans"], capability: "write", destination: text("Meal Plan", "Mahlzeitenplan", "خطة الوجبات"),
    eligible: c => (c.nutrition?.mealPlanCount ?? 0) === 0, priority: () => 82, contextChips: none
  },
  {
    id: "review-last-workout", category: "training",
    title: text("Review my last workout", "Mein letztes Training prüfen", "راجع آخر تمرين"),
    description: text("Review the completed workout and identify practical next steps.", "Prüfe das abgeschlossene Training und nenne praktische nächste Schritte.", "راجع التمرين المكتمل وحدد الخطوات العملية التالية."),
    template: (_c, l) => value(text("Review my most recent completed workout from Plaivra. Explain performance, consistency, and one or two practical next steps. Do not change my plan.", "Prüfe mein zuletzt abgeschlossenes Training in Plaivra. Erkläre Leistung, Beständigkeit und ein oder zwei praktische nächste Schritte. Ändere meinen Plan nicht.", "راجع آخر تمرين مكتمل في Plaivra. اشرح الأداء والانتظام وخطوة أو خطوتين عمليتين تاليتين. لا تغيّر خطتي."), l),
    permissionSections: ["workouts"], capability: "read", eligible: c => Boolean(c.workout?.completed), priority: () => 92, contextChips: none
  },
  {
    id: "catch-up", category: "daily",
    title: text("Catch me up", "Bring mich auf den Stand", "لخّص وضعي"),
    description: text("Summarize today's available Plaivra context and the next useful action.", "Fasse den heute verfügbaren Plaivra-Kontext und den nächsten sinnvollen Schritt zusammen.", "لخّص سياق Plaivra المتاح اليوم والخطوة المفيدة التالية."),
    template: (_c, l) => value(text("Catch me up on today using only my authorized Plaivra context. Summarize what is active, what is complete, and the next useful action. Do not change data.", "Bring mich für heute auf den Stand und nutze nur meinen autorisierten Plaivra-Kontext. Fasse zusammen, was aktiv und abgeschlossen ist und was als Nächstes sinnvoll ist. Ändere keine Daten.", "لخّص وضعي اليوم باستخدام سياق Plaivra المصرح به فقط. اذكر ما هو نشط وما اكتمل وما الخطوة المفيدة التالية. لا تغيّر البيانات."), l),
    permissionSections: ["workouts", "nutrition", "hydration", "wellness"], capability: "read", eligible: always, priority: () => 30, contextChips: none
  }
];

export function localizePrompt(definition: QuickPromptDefinition, language: PromptLanguage) {
  return { title: value(definition.title, language), description: value(definition.description, language) };
}

export function rankQuickPrompts(context: QuickPromptContext) {
  return QUICK_PROMPTS.filter((prompt) => prompt.eligible(context)).sort((a, b) => b.priority(context) - a.priority(context));
}
