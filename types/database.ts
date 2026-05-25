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
  is_global: boolean;
};

export type WorkoutSession = {
  id: string;
  user_id: string;
  workout_id: string | null;
  workout_name: string;
  started_at: string;
  completed_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  status: "started" | "completed";
};

export type Weekday = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";

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

export type UserWorkoutPlan = {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  days: UserWorkoutPlanDay[];
};

export type ProgressEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  body_weight_kg: number | null;
  waist_cm: number | null;
  notes: string | null;
};

export type WelcomeSettings = {
  popup_enabled: boolean;
  show_frequency: "every_login" | "once_per_day";
  default_message: string;
};
