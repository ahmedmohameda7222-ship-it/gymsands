import type { RawPromptSpec } from "@/lib/ai/prompt-catalog/types";

export const TRAINING_PROMPTS = [
  ["create-workout-plan", "training", ["Create a workout plan", "Trainingsplan erstellen", "أنشئ خطة تمرين"], "write", ["workouts", "profile"], ["get_training_planning_context", "create_custom_workout_plan"], "noWorkoutPlan", true, 86],
  ["adjust-today-workout", "training", ["Adjust today's workout", "Heutiges Training anpassen", "عدّل تمرين اليوم"], "write", ["workouts", "profile"], ["get_workout_adjustment_context", "adjust_next_workout"], "scheduledWorkout", false, 105],
  ["lighter-workout", "training", ["Make today lighter", "Heutiges Training leichter machen", "خفّف تمرين اليوم"], "write", ["workouts", "wellness"], ["get_daily_execution_context", "adjust_for_low_readiness"], "scheduledWorkout", false, 100],
  ["replace-exercise", "training", ["Replace an exercise", "Übung ersetzen", "استبدل تمرينًا"], "write", ["workouts", "profile"], ["get_workout_adjustment_context", "replace_exercise"], "selectedExercise", false, 82],
  ["review-last-workout", "training", ["Review my last workout", "Mein letztes Training prüfen", "راجع آخر تمرين"], "read", ["workouts"], ["get_progress_context", "review_workout_session"], "workoutHistory", false, 91],
  ["explain-progression", "training", ["Explain my progression", "Meine Progression erklären", "اشرح تقدمي التدريبي"], "read", ["workouts", "progress"], ["get_progress_context", "explain_progression"], "workoutHistory", false, 66],
  ["plan-next-workout", "training", ["Plan my next workout", "Nächstes Training planen", "خطط لتمريناتي القادمة"], "read", ["workouts", "profile"], ["get_training_planning_context", "get_progress_context"], "workoutPlan", false, 64],
  ["review-workout-consistency", "training", ["Review workout consistency", "Trainingskonstanz prüfen", "راجع انتظام التمرين"], "read", ["workouts", "progress"], ["get_progress_context"], "workoutHistory", false, 58],
  ["suggest-warmup", "training", ["Suggest a warm-up", "Aufwärmen vorschlagen", "اقترح إحماءً"], "read", ["workouts", "profile"], ["get_training_planning_context"], "scheduledWorkout", true, 55],
  ["adapt-equipment", "training", ["Adapt training to my equipment", "Training an Geräte anpassen", "كيّف التدريب مع معداتي"], "write", ["workouts", "profile"], ["get_workout_adjustment_context", "adjust_next_workout"], "scheduledWorkout", false, 60],
  ["adapt-time", "training", ["Adapt training to available time", "Training an verfügbare Zeit anpassen", "كيّف التدريب مع الوقت المتاح"], "write", ["workouts", "profile"], ["get_workout_adjustment_context", "adjust_next_workout"], "scheduledWorkout", false, 63],
] as const satisfies readonly RawPromptSpec[];
