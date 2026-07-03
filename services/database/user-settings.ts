import { supabase } from "@/lib/supabase/client";
import { defaultThemeId, isThemeId, type ThemeId } from "@/lib/themes";
import { isUuid } from "@/lib/utils";

export type QuickLogSection = "water" | "meal" | "weight" | "workout" | "progress" | "sleep" | "supplements" | "wellness";
const allQuickLogSections: QuickLogSection[] = ["water", "meal", "weight", "workout", "progress", "sleep", "supplements", "wellness"];

export type UserAppSettings = {
  id?: string;
  userId: string;
  themeId: ThemeId;
  theme: "light" | "dark" | "system";
  accentColor: "olive" | "champagne" | "sage";
  language: "en" | "de" | "ar" | "system";
  weightUnit: "kg" | "lb";
  heightUnit: "cm" | "ft-in";
  distanceUnit: "km" | "miles";
  liquidUnit: "ml" | "oz";
  energyUnit: "kcal" | "kJ";
  bodyMeasurementUnit: "cm" | "inches";
  weekStartsOn: "monday" | "sunday";
  defaultStartPage: "today" | "dashboard" | "train" | "eat" | "progress";
  compactMode: boolean;
  reduceAnimations: boolean;
  largeTextMode: boolean;
  daysPerWeek: string | null;
  workoutDuration: string | null;
  preferredSplit: string | null;
  dailyCalories: string | null;
  proteinTarget: string | null;
  carbsTarget: string | null;
  fatTarget: string | null;
  dailyWaterGoal: string | null;
  trackBodyWeight: boolean;
  trackBodyMeasurements: boolean;
  trackProgressPhotos: boolean;
  sleepTarget: string | null;
  trackSleepQuality: boolean;
  stepTarget: string | null;
  trackSteps: boolean;
  trackHabits: boolean;
  workoutReminders: boolean;
  workoutTime: string | null;
  mealReminders: boolean;
  remindBeforeMeals: boolean;
  hydrationReminders: boolean;
  hydrationInterval: string | null;
  bedtimeReminder: boolean;
  bedtime: string | null;
  supplementReminders: boolean;
  weighInReminder: boolean;
  weighInDay: string | null;
  photoReminder: boolean;
  photoFrequency: string | null;
  habitReminders: boolean;
  quietHours: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  hideBodyWeightOnDashboard: boolean;
  hideCaloriesOnDashboard: boolean;
  hideProgressPhotos: boolean;
  hideProfileDetails: boolean;
  privateProfileMode: boolean;
  quickLogSections: QuickLogSection[];
  createdAt?: string;
  updatedAt?: string;
};

type UserAppSettingsRow = {
  id: string;
  user_id: string;
  theme_id: string;
  theme: string;
  accent_color: string;
  language: string;
  weight_unit: string;
  height_unit: string;
  distance_unit: string;
  liquid_unit: string;
  energy_unit: string;
  body_measurement_unit: string;
  week_starts_on: string;
  default_start_page: string;
  compact_mode: boolean;
  reduce_animations: boolean;
  large_text_mode: boolean;
  days_per_week: string | null;
  workout_duration: string | null;
  preferred_split: string | null;
  daily_calories: string | null;
  protein_target: string | null;
  carbs_target: string | null;
  fat_target: string | null;
  daily_water_goal: string | null;
  track_body_weight: boolean;
  track_body_measurements: boolean;
  track_progress_photos: boolean;
  sleep_target: string | null;
  track_sleep_quality: boolean;
  step_target: string | null;
  track_steps: boolean;
  track_habits: boolean;
  workout_reminders: boolean;
  workout_time: string | null;
  meal_reminders: boolean;
  remind_before_meals: boolean;
  hydration_reminders: boolean;
  hydration_interval: string | null;
  bedtime_reminder: boolean;
  bedtime: string | null;
  supplement_reminders: boolean;
  weigh_in_reminder: boolean;
  weigh_in_day: string | null;
  photo_reminder: boolean;
  photo_frequency: string | null;
  habit_reminders: boolean;
  quiet_hours: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  hide_body_weight_on_dashboard: boolean;
  hide_calories_on_dashboard: boolean;
  hide_progress_photos: boolean;
  hide_profile_details: boolean;
  private_profile_mode: boolean;
  quick_log_sections?: string[];
  created_at: string;
  updated_at: string;
};

export const defaultUserAppSettings: UserAppSettings = {
  userId: "",
  themeId: defaultThemeId,
  theme: "system",
  accentColor: "olive",
  language: "en",
  weightUnit: "kg",
  heightUnit: "cm",
  distanceUnit: "km",
  liquidUnit: "ml",
  energyUnit: "kcal",
  bodyMeasurementUnit: "cm",
  weekStartsOn: "monday",
  defaultStartPage: "today",
  compactMode: false,
  reduceAnimations: false,
  largeTextMode: false,
  daysPerWeek: null,
  workoutDuration: null,
  preferredSplit: null,
  dailyCalories: null,
  proteinTarget: null,
  carbsTarget: null,
  fatTarget: null,
  dailyWaterGoal: null,
  trackBodyWeight: false,
  trackBodyMeasurements: false,
  trackProgressPhotos: false,
  sleepTarget: null,
  trackSleepQuality: false,
  stepTarget: null,
  trackSteps: false,
  trackHabits: false,
  workoutReminders: false,
  workoutTime: null,
  mealReminders: false,
  remindBeforeMeals: false,
  hydrationReminders: false,
  hydrationInterval: null,
  bedtimeReminder: false,
  bedtime: null,
  supplementReminders: false,
  weighInReminder: false,
  weighInDay: null,
  photoReminder: false,
  photoFrequency: null,
  habitReminders: false,
  quietHours: false,
  quietStart: null,
  quietEnd: null,
  hideBodyWeightOnDashboard: false,
  hideCaloriesOnDashboard: false,
  hideProgressPhotos: false,
  hideProfileDetails: false,
  privateProfileMode: false,
  quickLogSections: [...allQuickLogSections]
};

function canUseUserSettings(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function stringOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function quickLogSections(value: unknown) {
  if (!Array.isArray(value)) return [...allQuickLogSections];
  const selected = value.filter((item): item is QuickLogSection => typeof item === "string" && allQuickLogSections.includes(item as QuickLogSection));
  return [...new Set(selected)];
}

function normalizeSettings(value: Partial<UserAppSettings>, userId: string): UserAppSettings {
  return {
    ...defaultUserAppSettings,
    ...value,
    userId,
    themeId: isThemeId(value.themeId) ? value.themeId : defaultUserAppSettings.themeId,
    theme: pick(value.theme, ["light", "dark", "system"], defaultUserAppSettings.theme),
    accentColor: pick(value.accentColor, ["olive", "champagne", "sage"], defaultUserAppSettings.accentColor),
    language: pick(value.language, ["en", "de", "ar", "system"], defaultUserAppSettings.language),
    weightUnit: pick(value.weightUnit, ["kg", "lb"], defaultUserAppSettings.weightUnit),
    heightUnit: pick(value.heightUnit, ["cm", "ft-in"], defaultUserAppSettings.heightUnit),
    distanceUnit: pick(value.distanceUnit, ["km", "miles"], defaultUserAppSettings.distanceUnit),
    liquidUnit: pick(value.liquidUnit, ["ml", "oz"], defaultUserAppSettings.liquidUnit),
    energyUnit: pick(value.energyUnit, ["kcal", "kJ"], defaultUserAppSettings.energyUnit),
    bodyMeasurementUnit: pick(value.bodyMeasurementUnit, ["cm", "inches"], defaultUserAppSettings.bodyMeasurementUnit),
    weekStartsOn: pick(value.weekStartsOn, ["monday", "sunday"], defaultUserAppSettings.weekStartsOn),
    defaultStartPage: pick(value.defaultStartPage, ["today", "dashboard", "train", "eat", "progress"], defaultUserAppSettings.defaultStartPage),
    compactMode: bool(value.compactMode),
    reduceAnimations: bool(value.reduceAnimations),
    largeTextMode: bool(value.largeTextMode),
    trackBodyWeight: bool(value.trackBodyWeight),
    trackBodyMeasurements: bool(value.trackBodyMeasurements),
    trackProgressPhotos: bool(value.trackProgressPhotos),
    trackSleepQuality: bool(value.trackSleepQuality),
    trackSteps: bool(value.trackSteps),
    trackHabits: bool(value.trackHabits),
    workoutReminders: bool(value.workoutReminders),
    mealReminders: bool(value.mealReminders),
    remindBeforeMeals: bool(value.remindBeforeMeals),
    hydrationReminders: bool(value.hydrationReminders),
    bedtimeReminder: bool(value.bedtimeReminder),
    supplementReminders: bool(value.supplementReminders),
    weighInReminder: bool(value.weighInReminder),
    photoReminder: bool(value.photoReminder),
    habitReminders: bool(value.habitReminders),
    quietHours: bool(value.quietHours),
    hideBodyWeightOnDashboard: bool(value.hideBodyWeightOnDashboard),
    hideCaloriesOnDashboard: bool(value.hideCaloriesOnDashboard),
    hideProgressPhotos: bool(value.hideProgressPhotos),
    hideProfileDetails: bool(value.hideProfileDetails),
    privateProfileMode: bool(value.privateProfileMode),
    quickLogSections: quickLogSections(value.quickLogSections)
  };
}

function rowToSettings(row: UserAppSettingsRow): UserAppSettings {
  return normalizeSettings(
    {
      id: row.id,
      themeId: row.theme_id as UserAppSettings["themeId"],
      theme: row.theme as UserAppSettings["theme"],
      accentColor: row.accent_color as UserAppSettings["accentColor"],
      language: row.language as UserAppSettings["language"],
      weightUnit: row.weight_unit as UserAppSettings["weightUnit"],
      heightUnit: row.height_unit as UserAppSettings["heightUnit"],
      distanceUnit: row.distance_unit as UserAppSettings["distanceUnit"],
      liquidUnit: row.liquid_unit as UserAppSettings["liquidUnit"],
      energyUnit: row.energy_unit as UserAppSettings["energyUnit"],
      bodyMeasurementUnit: row.body_measurement_unit as UserAppSettings["bodyMeasurementUnit"],
      weekStartsOn: row.week_starts_on as UserAppSettings["weekStartsOn"],
      defaultStartPage: row.default_start_page as UserAppSettings["defaultStartPage"],
      compactMode: row.compact_mode,
      reduceAnimations: row.reduce_animations,
      largeTextMode: row.large_text_mode,
      daysPerWeek: row.days_per_week,
      workoutDuration: row.workout_duration,
      preferredSplit: row.preferred_split,
      dailyCalories: row.daily_calories,
      proteinTarget: row.protein_target,
      carbsTarget: row.carbs_target,
      fatTarget: row.fat_target,
      dailyWaterGoal: row.daily_water_goal,
      trackBodyWeight: row.track_body_weight,
      trackBodyMeasurements: row.track_body_measurements,
      trackProgressPhotos: row.track_progress_photos,
      sleepTarget: row.sleep_target,
      trackSleepQuality: row.track_sleep_quality,
      stepTarget: row.step_target,
      trackSteps: row.track_steps,
      trackHabits: row.track_habits,
      workoutReminders: row.workout_reminders,
      workoutTime: row.workout_time,
      mealReminders: row.meal_reminders,
      remindBeforeMeals: row.remind_before_meals,
      hydrationReminders: row.hydration_reminders,
      hydrationInterval: row.hydration_interval,
      bedtimeReminder: row.bedtime_reminder,
      bedtime: row.bedtime,
      supplementReminders: row.supplement_reminders,
      weighInReminder: row.weigh_in_reminder,
      weighInDay: row.weigh_in_day,
      photoReminder: row.photo_reminder,
      photoFrequency: row.photo_frequency,
      habitReminders: row.habit_reminders,
      quietHours: row.quiet_hours,
      quietStart: row.quiet_start,
      quietEnd: row.quiet_end,
      hideBodyWeightOnDashboard: row.hide_body_weight_on_dashboard,
      hideCaloriesOnDashboard: row.hide_calories_on_dashboard,
      hideProgressPhotos: row.hide_progress_photos,
      hideProfileDetails: row.hide_profile_details,
      privateProfileMode: row.private_profile_mode,
      quickLogSections: quickLogSections(row.quick_log_sections),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    row.user_id
  );
}

function settingsToDatabase(settings: UserAppSettings) {
  return {
    user_id: settings.userId,
    theme_id: settings.themeId,
    theme: settings.theme,
    accent_color: settings.accentColor,
    language: settings.language,
    weight_unit: settings.weightUnit,
    height_unit: settings.heightUnit,
    distance_unit: settings.distanceUnit,
    liquid_unit: settings.liquidUnit,
    energy_unit: settings.energyUnit,
    body_measurement_unit: settings.bodyMeasurementUnit,
    week_starts_on: settings.weekStartsOn,
    default_start_page: settings.defaultStartPage,
    compact_mode: settings.compactMode,
    reduce_animations: settings.reduceAnimations,
    large_text_mode: settings.largeTextMode,
    days_per_week: stringOrNull(settings.daysPerWeek),
    workout_duration: stringOrNull(settings.workoutDuration),
    preferred_split: stringOrNull(settings.preferredSplit),
    daily_calories: stringOrNull(settings.dailyCalories),
    protein_target: stringOrNull(settings.proteinTarget),
    carbs_target: stringOrNull(settings.carbsTarget),
    fat_target: stringOrNull(settings.fatTarget),
    daily_water_goal: stringOrNull(settings.dailyWaterGoal),
    track_body_weight: settings.trackBodyWeight,
    track_body_measurements: settings.trackBodyMeasurements,
    track_progress_photos: settings.trackProgressPhotos,
    sleep_target: stringOrNull(settings.sleepTarget),
    track_sleep_quality: settings.trackSleepQuality,
    step_target: stringOrNull(settings.stepTarget),
    track_steps: settings.trackSteps,
    track_habits: settings.trackHabits,
    workout_reminders: settings.workoutReminders,
    workout_time: stringOrNull(settings.workoutTime),
    meal_reminders: settings.mealReminders,
    remind_before_meals: settings.remindBeforeMeals,
    hydration_reminders: settings.hydrationReminders,
    hydration_interval: stringOrNull(settings.hydrationInterval),
    bedtime_reminder: settings.bedtimeReminder,
    bedtime: stringOrNull(settings.bedtime),
    supplement_reminders: settings.supplementReminders,
    weigh_in_reminder: settings.weighInReminder,
    weigh_in_day: stringOrNull(settings.weighInDay),
    photo_reminder: settings.photoReminder,
    photo_frequency: stringOrNull(settings.photoFrequency),
    habit_reminders: settings.habitReminders,
    quiet_hours: settings.quietHours,
    quiet_start: stringOrNull(settings.quietStart),
    quiet_end: stringOrNull(settings.quietEnd),
    hide_body_weight_on_dashboard: settings.hideBodyWeightOnDashboard,
    hide_calories_on_dashboard: settings.hideCaloriesOnDashboard,
    hide_progress_photos: settings.hideProgressPhotos,
    hide_profile_details: settings.hideProfileDetails,
    private_profile_mode: settings.privateProfileMode,
    quick_log_sections: settings.quickLogSections
  };
}

function fallbackSettings(userId: string): UserAppSettings {
  return normalizeSettings(defaultUserAppSettings, userId);
}

export async function getUserAppSettings(userId: string): Promise<UserAppSettings> {
  if (!canUseUserSettings(userId)) return fallbackSettings(userId);

  const { data, error } = await supabase!
    .from("user_app_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return rowToSettings(data as UserAppSettingsRow);

  const defaults = fallbackSettings(userId);
  const inserted = await supabase!
    .from("user_app_settings")
    .insert(settingsToDatabase(defaults))
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return rowToSettings(inserted.data as UserAppSettingsRow);
}

export async function upsertUserAppSettings(userId: string, patch: Partial<UserAppSettings>): Promise<UserAppSettings> {
  if (!canUseUserSettings(userId)) return normalizeSettings({ ...defaultUserAppSettings, ...patch }, userId);

  const current = await getUserAppSettings(userId);
  const next = normalizeSettings({ ...current, ...patch }, userId);

  const { data, error } = await supabase!
    .from("user_app_settings")
    .upsert(settingsToDatabase(next), { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw error;
  return rowToSettings(data as UserAppSettingsRow);
}

export async function resetUserAppSettings(userId: string): Promise<UserAppSettings> {
  if (!canUseUserSettings(userId)) return fallbackSettings(userId);

  const defaults = fallbackSettings(userId);
  const { data, error } = await supabase!
    .from("user_app_settings")
    .upsert(settingsToDatabase(defaults), { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw error;
  return rowToSettings(data as UserAppSettingsRow);
}

export function defaultStartPageToPath(startPage: UserAppSettings["defaultStartPage"]) {
  switch (startPage) {
    case "dashboard":
    case "today":
      return "/dashboard";
    case "train":
      return "/my-workout/plans";
    case "eat":
      return "/calories";
    case "progress":
      return "/progress";
    default:
      return "/dashboard";
  }
}
