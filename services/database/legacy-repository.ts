export {
  addCustomFoodLog,
  addCustomMealToLog,
  addCustomMealToMealPlan,
  addFoodToMealPlan,
  addGlobalFoodToToday,
  addWaterLog,
  copyYesterdaysMeals,
  createFoodKitchen,
  createFoodSubcategory,
  deleteCustomMeal,
  deleteFoodLog,
  deleteMealPlanItem,
  deleteUserFood,
  deleteWaterLog,
  egyptianFoodKitchenName,
  egyptianFoodSubcategories,
  getCalorieTargets,
  getCustomMeals,
  getDefaultFoodCategories,
  getFoodCategories,
  getFoodKitchens,
  getFoodLibrary,
  getGlobalFoods,
  getNutritionWeek,
  getTodayFoodLogs,
  getTodayMealPlanItems,
  getUserFoods,
  getWaterLogs,
  markMealPlanItemDone,
  mealTypes,
  updateFoodLogQuantity,
  updateMealPlanItem,
  upsertCalorieTargets,
  upsertCustomMeal,
  upsertUserFood
} from "./nutrition";
export type { CustomMealInput, UserFoodInput } from "./nutrition";

export {
  getExerciseVideos,
  getUserExerciseVideo,
  getWorkout,
  getWorkoutCategories,
  getWorkoutFilterOptions,
  getWorkouts,
  resetUserExerciseVideo,
  upsertUserExerciseVideo
} from "./workout-library";
export type { WorkoutFilters, WorkoutFilterOptions } from "./workout-library";

export {
  completeWorkoutSession,
  getOpenWorkoutDaySession,
  getOrStartWorkoutDaySession,
  getScheduledWorkoutActivity,
  getScheduledWorkoutHistory,
  getWorkoutActivity,
  getWorkoutHistory,
  getWorkoutHistoryDetailed,
  getWorkoutSessionLogs,
  saveWorkoutSetLogs,
  skipWorkoutDay,
  startWorkoutDaySession,
  startWorkoutSession,
  updateWorkoutSessionDuration
} from "./workout-sessions";
export type { WorkoutSetLogInput } from "./workout-sessions";

export {
  createUserWorkoutPlan,
  createUserWorkoutPlanDay,
  deleteUserWorkoutPlan,
  getActiveUserWorkoutPlan,
  getCurrentWeekday,
  getDefaultUserWorkoutPlan,
  getUserWorkoutPlan,
  getUserWorkoutPlanDay,
  getUserWorkoutPlans,
  getWorkoutPlanDurationOptions,
  getWorkoutPlanWeekOptions,
  setDefaultUserWorkoutPlan,
  updateUserWorkoutPlanDay,
  weekDays,
  workoutsFromPlanDay
} from "./workout-plans";
export type { WorkoutPlanDayInput } from "./workout-plans";

export { getOnboarding, saveOnboarding, updateProfile } from "./profile";

export { addProgressEntry, deletePersonalRecord, getPersonalRecords, getProgressEntries, upsertPersonalRecord } from "./progress";
export type { PersonalRecordInput } from "./progress";

export {
  deleteDailyFitTask,
  deleteFitnessHabit,
  deleteSleepRecoveryLog,
  deleteSupplementLog,
  getDailyFitTasks,
  getFitnessHabits,
  getSleepRecoveryLogs,
  getSupplementLogs,
  upsertDailyFitTask,
  upsertFitnessHabit,
  upsertSleepRecoveryLog,
  upsertSupplementLog
} from "./wellness";
export type { DailyFitTaskInput, FitnessHabitInput, SleepRecoveryInput, SupplementLogInput } from "./wellness";

export { adminUpdateWelcomeSettings, adminUpsertWelcomeMessage, getWelcomeSettings } from "./settings";

export { adminListUsers, adminUpdateUserRole } from "./admin";
