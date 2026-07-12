import type { RawPromptSpec } from "@/lib/ai/prompt-catalog/types";

export const NUTRITION_PROMPTS = [
  ["finish-macros", "nutrition", ["Help me finish this day's macros", "Makros dieses Tages vervollständigen", "ساعدني على إكمال ماكروز هذا اليوم"], "read", ["nutrition"], ["get_daily_execution_context"], "knownMacros", true, 88],
  ["estimate-meal-photo", "nutrition", ["Estimate meal from photo", "Mahlzeit aus Foto schätzen", "قدّر الوجبة من الصورة"], "read", [], ["search_foods"], "always", true, 72],
  ["plan-rest-meals", "nutrition", ["Plan the remaining meals", "Verbleibende Mahlzeiten planen", "خطط للوجبات المتبقية"], "read", ["nutrition", "meal_plans", "profile"], ["get_daily_execution_context", "get_nutrition_planning_context"], "knownMacros", true, 75],
  ["review-day-nutrition", "nutrition", ["Review this day's nutrition", "Ernährung dieses Tages prüfen", "راجع تغذية هذا اليوم"], "read", ["nutrition"], ["get_daily_execution_context"], "foodLogsKnown", true, 64],
  ["create-meal-plan", "nutrition", ["Create a meal plan", "Mahlzeitenplan erstellen", "أنشئ خطة وجبات"], "write", ["nutrition", "meal_plans", "profile"], ["get_nutrition_planning_context", "create_day_meal_plan", "create_week_meal_plan", "build_meal_plan"], "noMealPlan", true, 84],
  ["adjust-meal-plan", "nutrition", ["Adjust my meal plan", "Mahlzeitenplan anpassen", "عدّل خطة وجباتي"], "write", ["nutrition", "meal_plans", "profile"], ["get_meal_plan_for_week", "update_meal_plan_item", "regenerate_meal"], "mealPlan", false, 68],
  ["replace-meal", "nutrition", ["Replace this meal", "Diese Mahlzeit ersetzen", "استبدل هذه الوجبة"], "write", ["nutrition", "meal_plans", "profile"], ["regenerate_meal"], "selectedMeal", false, 92],
  ["make-meal-cheaper", "nutrition", ["Make it cheaper", "Günstiger machen", "اجعلها أقل تكلفة"], "write", ["nutrition", "meal_plans", "profile"], ["make_meal_cheaper"], "selectedMeal", false, 82],
  ["make-meal-faster", "nutrition", ["Make it faster", "Schneller machen", "اجعلها أسرع"], "write", ["nutrition", "meal_plans", "profile"], ["make_meal_faster"], "selectedMeal", false, 80],
  ["make-meal-higher-protein", "nutrition", ["Make it higher in protein", "Proteinreicher machen", "اجعلها أعلى في البروتين"], "write", ["nutrition", "meal_plans", "profile"], ["make_meal_higher_protein"], "selectedMeal", false, 78],
  ["swap-meal-ingredients", "nutrition", ["Swap ingredients", "Zutaten austauschen", "بدّل المكونات"], "write", ["nutrition", "meal_plans", "profile"], ["replace_meal_ingredient"], "selectedMeal", false, 76],
  ["make-meal-dairy-free", "nutrition", ["Make it dairy-free", "Milchfrei machen", "اجعلها خالية من منتجات الألبان"], "write", ["nutrition", "meal_plans", "profile"], ["make_meal_dairy_free"], "selectedMeal", false, 74],
  ["make-meal-gluten-free", "nutrition", ["Make it gluten-free", "Glutenfrei machen", "اجعلها خالية من الغلوتين"], "write", ["nutrition", "meal_plans", "profile"], ["make_meal_gluten_free"], "selectedMeal", false, 73],
  ["cheaper-meal", "nutrition", ["Suggest a cheaper meal", "Günstigere Mahlzeit vorschlagen", "اقترح وجبة أرخص"], "read", ["nutrition", "profile"], ["get_nutrition_planning_context"], "nutritionPreferences", false, 48],
  ["high-protein-option", "nutrition", ["Suggest a high-protein option", "Proteinreiche Option vorschlagen", "اقترح خيارًا عالي البروتين"], "read", ["nutrition"], ["get_nutrition_planning_context"], "nutritionTargets", true, 57],
  ["review-week-nutrition", "nutrition", ["Review this week's nutrition", "Ernährung dieser Woche prüfen", "راجع تغذية هذا الأسبوع"], "read", ["nutrition", "progress"], ["get_progress_context", "get_nutrition_planning_context"], "foodLogsKnown", false, 52],
  ["review-hydration", "nutrition", ["Review hydration", "Hydration prüfen", "راجع الترطيب"], "read", ["hydration"], ["get_water_summary"], "hydrationKnown", true, 54],
  ["meal-prep-plan", "nutrition", ["Create a meal-preparation plan", "Meal-Prep-Plan erstellen", "أنشئ خطة تحضير وجبات"], "read", ["nutrition", "meal_plans", "profile"], ["get_nutrition_planning_context", "get_meal_plan_for_week"], "mealPlan", false, 47]
] as const satisfies readonly RawPromptSpec[];
