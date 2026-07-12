import type { RawPromptSpec } from "@/lib/ai/prompt-catalog/types";

export const PROGRESS_DAILY_PROFILE_PROMPTS = [
  ["review-week", "progress", ["Review my week", "Meine Woche prüfen", "راجع أسبوعي"], "read", ["workouts", "nutrition", "hydration", "wellness", "progress"], ["get_progress_context", "review_week"], "progressOrHistory", true, 78],
  ["explain-progress", "progress", ["Explain my progress", "Meinen Fortschritt erklären", "اشرح تقدمي"], "read", ["progress", "workouts", "nutrition"], ["get_progress_context"], "progressData", false, 61],
  ["improve-next-week", "progress", ["What should I improve next week?", "Was soll ich nächste Woche verbessern?", "ماذا أحسن الأسبوع القادم؟"], "read", ["progress", "workouts", "nutrition", "wellness"], ["get_progress_context"], "progressOrHistory", true, 59],
  ["review-consistency", "progress", ["Review my consistency", "Meine Konstanz prüfen", "راجع استمراريتي"], "read", ["progress", "workouts", "nutrition", "wellness"], ["get_progress_context"], "progressOrHistory", false, 53],
  ["identify-plateau", "progress", ["Identify a plateau", "Plateau erkennen", "حدد ثبات التقدم"], "read", ["progress", "workouts"], ["get_progress_context"], "progressData", false, 43],
  ["plan-rest-day", "daily", ["Plan the rest of my day", "Den Rest meines Tages planen", "خطط لبقية يومي"], "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", true, 70],
  ["what-next", "daily", ["What should I do next?", "Was soll ich als Nächstes tun?", "ماذا أفعل الآن؟"], "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", true, 65],
  ["catch-up", "daily", ["Catch me up", "Bring mich auf den Stand", "لخّص وضعي"], "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", true, 56],
  ["prioritize-incomplete", "daily", ["Prioritize today's incomplete actions", "Heutige offene Aktionen priorisieren", "رتّب إجراءات اليوم غير المكتملة"], "read", ["workouts", "nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", false, 51],
  ["end-day-plan", "daily", ["Build an end-of-day plan", "Plan für den Tagesabschluss erstellen", "أنشئ خطة لنهاية اليوم"], "read", ["nutrition", "hydration", "wellness"], ["get_daily_execution_context"], "dailyContext", false, 48],
  ["review-goals", "profile", ["Review my goals", "Meine Ziele prüfen", "راجع أهدافي"], "read", ["profile"], ["get_training_planning_context"], "goals", false, 39],
  ["review-constraints", "profile", ["Review physical constraints", "Körperliche Einschränkungen prüfen", "راجع القيود البدنية"], "read", ["profile", "workouts"], ["get_training_planning_context"], "constraints", false, 37],
] as const satisfies readonly RawPromptSpec[];
