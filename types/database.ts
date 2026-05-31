export type UserRole = "member" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingAnswers = {
  id?: string;
  user_id: string;
  age_range: string;
  gender: string;
  height_cm: number;
  weight_kg: number;
  goal: string;
  training_level: string;
  training_place: string;
  training_days_per_week: number;
  workout_duration_minutes: number;
  available_equipment?: string[];
  nutrition_preferences: string[];
  allergies_limitations?: string | null;
};

export type FoodItem = {
  id: string;
  food_name: string;
  serving_size: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  category: string | null;
  cuisine: string | null;
  tags: string[] | null;
  notes: string | null;
  source_type: string;
  is_global: boolean;
  is_editable_by_user: boolean;
};

export type FoodLog = {
  id: string;
  user_id: string;
  food_item_id: string | null;
  user_food_item_id: string | null;
  log_date: string;
  meal_type: string;
  food_name: string;
  serving_size: string;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string | null;
};

export type MealType = "Breakfast" | "Lunch" | "Snack" | "Dinner";

export type MealPlanItemStatus = "planned" | "done";

export type MealPlanItem = {
  id: string;
  user_id: string;
  plan_date: string;
  meal_type: MealType;
  food_item_id: string | null;
  user_food_item_id: string | null;
  food_name: string;
  serving_size: string;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  status: MealPlanItemStatus;
  food_log_id: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Workout = {
  id: string;
  name: string;
  category: string;
  target_muscle: string;
  equipment: string;
  difficulty: string;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  instructions: string;
  notes: string | null;
  muscle_category?: string | null;
  equipment_required?: string | null;
  mechanics?: string | null;
  force_type?: string | null;
  experience_level?: string | null;
  secondary_muscles?: string[] | null;
  exercise_url?: string | null;
  video_url?: string | null;
  is_global: boolean;
};

export type ExerciseVideo = {
  id: string;
  exercise_name: string;
  category_type: string | null;
  category: string | null;
  exercise_url: string;
  video_url: string | null;
  instructions: string | null;
  source: string | null;
  muscle_category?: string | null;
  equipment_required?: string | null;
  mechanics?: string | null;
  force_type?: string | null;
  experience_level?: string | null;
  secondary_muscles?: string[] | null;
  is_global: boolean;
};

export type ExerciseMetadata = {
  id: string;
  muscle_category: string;
  exercise_name: string;
  equipment_required: string;
  mechanics: string;
  force_type: string;
  experience_level: string;
  secondary_muscles: string;
  exercise_url: string;
};

export type WorkoutSession = {
  id: string;
  user_id: string;
  workout_id: string | null;
  plan_id?: string | null;
  plan_day_id?: string | null;
  workout_day_name?: string | null;
  workout_category?: string | null;
  workout_name: string;
  started_at: string;
  completed_at: string | null;
  skipped_at?: string | null;
  duration_minutes: number | null;
  notes: string | null;
  status: "started" | "completed" | "skipped";
};

export type Weekday = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";

export type ExerciseLog = {
  id: string;
  workout_session_id: string;
  plan_exercise_id: string | null;
  exercise_order?: number | null;
  exercise_name: string;
  exercise_category?: string | null;
  planned_sets: number | null;
  planned_reps: string | null;
  planned_rest_seconds: number | null;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
};

export type WorkoutSessionSummary = WorkoutSession & {
  exercise_logs: ExerciseLog[];
};

export type WorkoutTemplateExercise = {
  id: string;
  workout_template_day_id: string;
  exercise_order: number;
  exercise_name: string;
  sets: string | null;
  reps: string | null;
};

export type WorkoutTemplateDay = {
  id: string;
  workout_template_id: string;
  day_index: number;
  day_title: string;
  exercises: WorkoutTemplateExercise[];
};

export type WorkoutTemplate = {
  id: string;
  title: string;
  main_goal: string;
  workout_type: string | null;
  training_level: string;
  program_duration_weeks: number;
  days_per_week: number;
  time_per_workout: string | null;
  equipment_required: string[];
  target_gender: string | null;
  days: WorkoutTemplateDay[];
};

export type GeneratedWorkoutSessionStatus = "scheduled" | "started" | "completed" | "skipped";

export type UserExerciseLog = {
  id: string;
  user_workout_session_id: string;
  workout_template_exercise_id: string | null;
  plan_exercise_id: string | null;
  exercise_order: number;
  exercise_name: string;
  planned_sets: string | null;
  planned_reps: string | null;
  weight_kg: number | null;
  reps: number | null;
  notes: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type UserWorkoutSession = {
  id: string;
  user_id: string;
  user_workout_plan_id: string;
  workout_template_day_id: string | null;
  plan_day_id: string | null;
  week_index: number;
  day_index: number;
  session_number: number;
  scheduled_date: string;
  day_title: string;
  status: GeneratedWorkoutSessionStatus;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  logs: UserExerciseLog[];
};

export type UserWorkoutPlanExercise = {
  id: string;
  plan_day_id: string;
  workout_id: string | null;
  source_workout_id: string | null;
  exercise_name: string;
  category: string | null;
  target_muscle: string | null;
  equipment: string | null;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  instructions?: string | null;
  video_url?: string | null;
  sort_order: number;
  notes: string | null;
};

export type UserWorkoutPlanDay = {
  id: string;
  plan_id: string;
  day_number: number;
  day_name: string;
  weekday: Weekday | null;
  notes: string | null;
  exercises: UserWorkoutPlanExercise[];
};

export type WorkoutPlanDaySession = UserWorkoutPlanDay & {
  plan: Pick<UserWorkoutPlan, "id" | "name" | "user_id"> | null;
};

export type UserWorkoutPlan = {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  template_id?: string | null;
  source?: "manual" | "template_recommendation";
  match_score?: number | null;
  match_explanation?: string | null;
  match_reasons?: string[] | null;
  program_duration_weeks?: number | null;
  days_per_week?: number | null;
  created_at: string;
  updated_at: string;
  days: UserWorkoutPlanDay[];
};

export type GeneratedWorkoutPlan = UserWorkoutPlan & {
  template: WorkoutTemplate | null;
  sessions: UserWorkoutSession[];
};

export type ProgressEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  body_weight_kg: number | null;
  waist_cm: number | null;
  notes: string | null;
  measurements?: BodyMeasurement | null;
};

export type BodyMeasurement = {
  id: string;
  user_id: string;
  progress_entry_id: string | null;
  measured_at: string;
  waist_cm: number | null;
  hips_cm: number | null;
  chest_cm: number | null;
  bust_cm: number | null;
  underbust_cm: number | null;
  neck_cm: number | null;
  shoulders_cm: number | null;
  left_arm_cm: number | null;
  right_arm_cm: number | null;
  left_thigh_cm: number | null;
  right_thigh_cm: number | null;
  glutes_cm: number | null;
  calves_cm: number | null;
  created_at: string;
};

export type WelcomeSettings = {
  popup_enabled: boolean;
  show_frequency: "every_login" | "once_per_day";
  default_message: string;
};
