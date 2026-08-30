export * from "./database-legacy";

import type {
  CustomMeal as LegacyCustomMeal,
  DailyNutritionSummary as LegacyDailyNutritionSummary,
  ExerciseAlternativeReason as LegacyExerciseAlternativeReason,
  ExerciseLog as LegacyExerciseLog,
  FoodItem as LegacyFoodItem,
  FoodLog as LegacyFoodLog,
  MealItem as LegacyMealItem,
  MealPlanItem as LegacyMealPlanItem,
  UserExerciseAlternative as LegacyUserExerciseAlternative,
  UserFoodItem as LegacyUserFoodItem,
  WorkoutSession as LegacyWorkoutSession,
  WorkoutSessionSummary as LegacyWorkoutSessionSummary
} from "./database-legacy";
import type { ExerciseAlternativeReasonV2 } from "./exercise-alternative";
import type { SavedWorkoutPerformanceMetricValue } from "./workout-performance";
import type {
  WorkoutSetDetailsRow,
  WorkoutSetSegmentRow,
  WorkoutSetType
} from "./workout-set-details";

/** Numeric nutrition remains the contract for manual/user-entered Food data and targets. */
export type CoreNutrition = Pick<LegacyFoodItem, "calories" | "protein_g" | "carbs_g" | "fat_g">;

/** Catalog-derived and frozen nutrition keeps unknown values distinct from measured zero. */
export type NullableCoreNutrition = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

type WithNullableCoreNutrition<T> = Omit<T, keyof NullableCoreNutrition> & NullableCoreNutrition;

export type CatalogFoodItem = Omit<
  LegacyFoodItem,
  keyof NullableCoreNutrition | "is_global" | "is_editable_by_user"
> &
  NullableCoreNutrition & {
    is_global: true;
    is_editable_by_user: false;
  };

export type FoodLibraryItem = CatalogFoodItem | LegacyUserFoodItem;
export type FoodLog = WithNullableCoreNutrition<LegacyFoodLog>;
export type MealItem = WithNullableCoreNutrition<LegacyMealItem>;
export type MealPlanItem = WithNullableCoreNutrition<LegacyMealPlanItem>;
export type DailyNutritionSummary = WithNullableCoreNutrition<LegacyDailyNutritionSummary>;
export type CustomMeal = Omit<LegacyCustomMeal, "items" | "totals"> & {
  items: MealItem[];
  totals: NullableCoreNutrition;
};

/**
 * Additive persistence contract. Historical V1 values remain readable while new
 * V2 product intents are stored without collapsing them into legacy aliases.
 */
export type ExerciseAlternativeReason = LegacyExerciseAlternativeReason | ExerciseAlternativeReasonV2;

export type UserExerciseAlternative = Omit<LegacyUserExerciseAlternative, "reason"> & {
  reason: ExerciseAlternativeReason;
};

export type WorkoutSessionStatus = "started" | "completed" | "skipped" | "cancelled";

export type WorkoutSession = Omit<LegacyWorkoutSession, "status"> & {
  status: WorkoutSessionStatus;
  cancelled_at?: string | null;
  cancel_reason?:
    | "user_cancelled"
    | "started_by_mistake"
    | "not_feeling_well"
    | "time_constraint"
    | "pain_or_discomfort"
    | "other"
    | null;
};

export type ExerciseLog = LegacyExerciseLog & {
  performance_metrics?: SavedWorkoutPerformanceMetricValue[];
  set_type?: WorkoutSetType;
  set_details?: WorkoutSetDetailsRow | null;
  segments?: WorkoutSetSegmentRow[];
};

export type WorkoutSessionSummary = Omit<LegacyWorkoutSessionSummary, keyof LegacyWorkoutSession | "exercise_logs"> &
  WorkoutSession & {
    exercise_logs: ExerciseLog[];
  };
