import type { RawPromptSpec } from "@/lib/ai/prompt-catalog/types";

export const GROCERY_RECOVERY_PROMPTS = [
  ["build-grocery-list", "grocery", ["Build my grocery list", "Einkaufsliste erstellen", "أنشئ قائمة تسوقي"], "write", ["meal_plans"], ["get_meal_plan_for_week", "generate_shopping_list", "build_grocery_list"], "mealPlan", false, 80],
  ["review-grocery-list", "grocery", ["Review my grocery list", "Einkaufsliste prüfen", "راجع قائمة تسوقي"], "read", ["meal_plans"], ["get_meal_plan_for_week", "generate_shopping_list"], "groceryItems", false, 49],
  ["reduce-grocery-cost", "grocery", ["Reduce grocery cost", "Einkaufskosten senken", "قلّل تكلفة التسوق"], "read", ["meal_plans", "nutrition", "profile"], ["get_meal_plan_for_week", "get_nutrition_planning_context"], "groceryItems", false, 46],
  ["group-grocery-sections", "grocery", ["Group items by store section", "Nach Ladenbereich gruppieren", "جمّع العناصر حسب قسم المتجر"], "read", ["meal_plans"], ["generate_shopping_list"], "groceryItems", false, 42],
  ["review-recovery", "recovery", ["Review my recovery", "Meine Erholung prüfen", "راجع تعافيّي"], "read", ["wellness", "workouts"], ["get_daily_execution_context"], "recoveryData", true, 90],
  ["train-today", "recovery", ["Should I train today?", "Soll ich heute trainieren?", "هل أتدرب اليوم؟"], "read", ["wellness", "workouts"], ["get_daily_execution_context"], "recoveryData", true, 67],
  ["reduce-stress", "recovery", ["Help me reduce stress today", "Stress heute reduzieren", "ساعدني على تقليل التوتر اليوم"], "read", ["wellness"], ["get_daily_execution_context"], "wellnessData", false, 50],
  ["review-sleep", "recovery", ["Review my sleep pattern", "Schlafmuster prüfen", "راجع نمط نومي"], "read", ["wellness"], ["get_daily_execution_context"], "recoveryData", false, 45],
  ["review-habits", "recovery", ["Review my habits", "Gewohnheiten prüfen", "راجع عاداتي"], "read", ["wellness"], ["get_daily_execution_context"], "wellnessData", false, 44],
  ["review-supplements", "recovery", ["Review supplement adherence", "Supplement-Umsetzung prüfen", "راجع الالتزام بالمكملات"], "read", ["wellness"], ["get_daily_execution_context"], "wellnessData", false, 40],
] as const satisfies readonly RawPromptSpec[];
