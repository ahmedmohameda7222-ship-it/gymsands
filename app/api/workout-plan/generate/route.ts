import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/integrations/env";
import { type CleanExercise } from "@/lib/workouts/exercise-selection";
import { generateWorkoutPlan } from "@/lib/workouts/generator";

type OnboardingRequest = {
  answers?: {
    age_range?: string;
    gender?: string;
    height_cm?: number | string | null;
    weight_kg?: number | string | null;
    goal?: string;
    goals?: string[];
    main_goal?: string;
    training_cycle?: string;
    training_level?: string;
    training_place?: string;
    training_days_per_week?: number;
    days_per_week?: number;
    workout_duration_minutes?: number;
    workout_time_minutes?: number;
    min_workout_duration_minutes?: number;
    max_workout_duration_minutes?: number;
    desired_duration_weeks?: number;
    available_equipment?: string[];
    nutrition_preferences?: string[];
    allergies_limitations?: string | null;
  };
};

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanStringList(values: unknown, fallback: string[]) {
  const selected = Array.isArray(values)
    ? values.map((item) => cleanString(item, "")).filter(Boolean)
    : [];
  return selected.length ? selected : fallback;
}

function cleanEquipment(values: unknown, trainingPlace: string) {
  const selected = cleanStringList(values, []);
  if (selected.length) return selected;
  if (trainingPlace === "Home") return ["Bodyweight", "Dumbbells", "Bands", "Home"];
  if (trainingPlace === "Both") return ["Full gym", "Bodyweight", "Dumbbells", "Bands"];
  return ["Full gym"];
}

function toCleanExercises(rows: any[]): CleanExercise[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    primary_muscle: row.primary_muscle,
    secondary_muscles: row.secondary_muscles ?? [],
    equipment: row.equipment ?? [],
    difficulty: row.difficulty,
    mechanics: row.mechanics,
    movement_pattern: row.movement_pattern,
    force_type: row.force_type,
    instructions: row.instructions
  }));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = (await request.json().catch(() => ({}))) as OnboardingRequest;
  const answers = body.answers ?? {};
  const userId = context.user.id;
  const trainingPlace = cleanString(answers.training_place, "Gym");
  const goals = cleanStringList(answers.goals, [cleanString(answers.main_goal ?? answers.goal, "General fitness")]);
  const mainGoal = goals[0] ?? "General fitness";
  const trainingCycle = cleanString(answers.training_cycle, "Full Body");
  const trainingLevel = cleanString(answers.training_level, "Beginner");
  const daysPerWeek = Math.max(2, Math.min(6, cleanNumber(answers.days_per_week ?? answers.training_days_per_week, 3)));
  const workoutTimeMinutes = Math.max(30, cleanNumber(answers.workout_time_minutes ?? answers.workout_duration_minutes, 45));
  const minWorkoutDuration = Math.max(20, cleanNumber(answers.min_workout_duration_minutes, workoutTimeMinutes));
  const maxWorkoutDuration = Math.max(minWorkoutDuration, cleanNumber(answers.max_workout_duration_minutes, workoutTimeMinutes));
  const desiredDurationWeeks = Math.max(1, Math.min(16, cleanNumber(answers.desired_duration_weeks, 4)));
  const gender = cleanString(answers.gender, "Prefer not to say");
  const heightCm = cleanOptionalNumber(answers.height_cm);
  const weightKg = cleanOptionalNumber(answers.weight_kg);
  const availableEquipment = cleanEquipment(answers.available_equipment, trainingPlace);
  const limitations = answers.allergies_limitations ?? null;

  const onboardingPayload = {
    user_id: userId,
    main_goal: mainGoal,
    goals,
    training_cycle: trainingCycle,
    training_level: trainingLevel,
    days_per_week: daysPerWeek,
    workout_time_minutes: workoutTimeMinutes,
    min_workout_duration_minutes: minWorkoutDuration,
    max_workout_duration_minutes: maxWorkoutDuration,
    available_equipment: availableEquipment,
    gender,
    height_cm: heightCm,
    weight_kg: weightKg,
    onboarding_answers: answers
  };

  const { data: onboarding, error: onboardingError } = await context.supabase
    .from("user_onboarding")
    .upsert(onboardingPayload, { onConflict: "user_id" })
    .select("id")
    .single();

  if (onboardingError || !onboarding) {
    return jsonError(onboardingError?.message ?? "Could not save onboarding.", 400);
  }

  const onboardingAnswersPayload = {
    user_id: userId,
    age_range: cleanString(answers.age_range, "25-34"),
    gender,
    height_cm: heightCm,
    weight_kg: weightKg,
    goal: goals.join(", "),
    goals,
    training_cycle: trainingCycle,
    training_level: trainingLevel,
    training_place: trainingPlace,
    training_days_per_week: daysPerWeek,
    workout_duration_minutes: workoutTimeMinutes,
    min_workout_duration_minutes: minWorkoutDuration,
    max_workout_duration_minutes: maxWorkoutDuration,
    desired_duration_weeks: desiredDurationWeeks,
    available_equipment: availableEquipment,
    nutrition_preferences: Array.isArray(answers.nutrition_preferences) ? answers.nutrition_preferences : [],
    allergies_limitations: limitations
  };

  const savedAnswers = await context.supabase.from("onboarding_answers").upsert(onboardingAnswersPayload, { onConflict: "user_id" });
  if (savedAnswers.error) return jsonError(savedAnswers.error.message, 400);

  const { data: exerciseRows, error: exerciseError } = await context.supabase
    .from("exercises")
    .select("id,name,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions")
    .eq("is_approved", true)
    .eq("is_global", true)
    .limit(1000);

  if (exerciseError) return jsonError(`${exerciseError.message}. Run migration 014 and approve imported wger exercises.`, 400);
  const exercises = toCleanExercises(exerciseRows ?? []);

  let generated;
  try {
    generated = generateWorkoutPlan(
      {
        mainGoal,
        goals,
        trainingLevel,
        daysPerWeek,
        workoutTimeMinutes,
        minWorkoutDurationMinutes: minWorkoutDuration,
        maxWorkoutDurationMinutes: maxWorkoutDuration,
        desiredDurationWeeks,
        availableEquipment,
        limitations
      },
      exercises
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not generate a complete workout plan.", 400);
  }

  await context.supabase
    .from("user_workout_plans")
    .update({ is_active: false, is_default: false })
    .eq("user_id", userId)
    .in("source", ["generated_rules", "template_recommendation"]);

  const { data: plan, error: planError } = await context.supabase
    .from("user_workout_plans")
    .insert({
      user_id: userId,
      name: generated.name,
      is_active: true,
      is_default: true,
      source: "generated_rules",
      match_score: 100,
      match_explanation: generated.explanation,
      match_reasons: generated.reasons,
      generated_from_onboarding_id: onboarding.id,
      program_duration_weeks: generated.durationWeeks,
      days_per_week: generated.daysPerWeek
    })
    .select("id,name")
    .single();

  if (planError || !plan) return jsonError(planError?.message ?? "Could not save generated plan.", 400);

  const savedDayIds: Array<{ id: string; dayNumber: number; dayName: string }> = [];

  for (const day of generated.days) {
    const { data: savedDay, error: dayError } = await context.supabase
      .from("user_workout_plan_days")
      .insert({
        plan_id: plan.id,
        day_number: day.dayNumber,
        day_name: day.dayName,
        weekday: day.weekday,
        notes: `${day.focus} with warm-up, strength, cardio, and cool-down`
      })
      .select("id,day_number,day_name")
      .single();
    if (dayError || !savedDay) return jsonError(dayError?.message ?? "Could not save plan day.", 400);
    savedDayIds.push({ id: savedDay.id, dayNumber: Number(savedDay.day_number), dayName: savedDay.day_name });

    const blockRows = day.blocks.map((block) => ({
      plan_day_id: savedDay.id,
      block_type: block.blockType,
      title: block.title,
      instructions: block.instructions ?? null,
      duration_minutes: block.durationMinutes ?? null,
      sort_order: block.sortOrder
    }));
    const { data: savedBlocks, error: blockError } = await context.supabase
      .from("user_workout_plan_blocks")
      .insert(blockRows)
      .select("id,block_type,sort_order");
    if (blockError || !savedBlocks) return jsonError(blockError?.message ?? "Could not save plan blocks.", 400);

    const blockIdByOrder = new Map(savedBlocks.map((block) => [Number(block.sort_order), block.id]));
    const blockItems = day.blocks.flatMap((block) => {
      const blockId = blockIdByOrder.get(block.sortOrder);
      if (!blockId) return [];
      return block.items.map((item) => ({
        block_id: blockId,
        exercise_id: item.exerciseId ?? null,
        name: item.name,
        sets: item.sets ?? null,
        reps: item.reps ?? null,
        duration_seconds: item.durationSeconds ?? null,
        distance_meters: item.distanceMeters ?? null,
        rest_seconds: item.restSeconds ?? null,
        intensity: item.intensity ?? null,
        notes: item.notes ?? null,
        sort_order: item.sortOrder
      }));
    });
    if (blockItems.length) {
      const { error: itemError } = await context.supabase.from("user_workout_plan_block_items").insert(blockItems);
      if (itemError) return jsonError(itemError.message, 400);
    }

    const mirrorRows = day.blocks.flatMap((block) =>
      block.items.map((item) => ({
        plan_day_id: savedDay.id,
        workout_id: null,
        source_workout_id: item.exerciseId ?? null,
        exercise_name: item.name,
        category: block.blockType,
        target_muscle: item.primaryMuscle ?? day.focus,
        equipment: item.equipment?.join(", ") || null,
        sets: item.sets ?? null,
        reps: item.reps ?? (item.durationSeconds ? `${Math.round(item.durationSeconds / 60)} min` : null),
        rest_seconds: item.restSeconds ?? null,
        instructions: item.instructions ?? block.instructions ?? null,
        exercise_url: null,
        video_url: null,
        custom_video_url: null,
        sort_order: block.sortOrder * 100 + item.sortOrder,
        notes: [block.title, item.intensity, item.notes].filter(Boolean).join(" | ") || null
      }))
    );
    const { error: mirrorError } = await context.supabase.from("user_workout_plan_exercises").insert(mirrorRows);
    if (mirrorError) return jsonError(mirrorError.message, 400);
  }

  const start = new Date();
  const scheduleRows = savedDayIds.flatMap((day, dayIndex) =>
    Array.from({ length: generated.durationWeeks }, (_, weekIndex) => ({
      user_id: userId,
      user_workout_plan_id: plan.id,
      workout_template_day_id: null,
      plan_day_id: day.id,
      week_index: weekIndex + 1,
      day_index: day.dayNumber,
      session_number: weekIndex * generated.daysPerWeek + dayIndex + 1,
      scheduled_date: dateOnly(addDays(start, weekIndex * 7 + dayIndex)),
      day_title: day.dayName,
      status: "scheduled"
    }))
  );
  if (scheduleRows.length) {
    const { error: sessionError } = await context.supabase.from("user_workout_sessions").insert(scheduleRows);
    if (sessionError) return jsonError(sessionError.message, 400);
  }

  const summary = {
    id: plan.id,
    title: plan.name,
    matchScore: 100,
    explanation: generated.explanation,
    goal: generated.goal,
    trainingCycle,
    level: generated.experience,
    durationWeeks: generated.durationWeeks,
    daysPerWeek: generated.daysPerWeek,
    duration: `${minWorkoutDuration}-${maxWorkoutDuration} minutes`,
    equipment: availableEquipment,
    blocks: ["warmup", "strength", "cardio", "cooldown"]
  };

  return NextResponse.json({ plans: [summary], plan: summary });
}
