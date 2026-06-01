import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  recommendWorkoutTemplates,
  type WorkoutRecommendationInput,
  type WorkoutTemplateCandidate,
  type WorkoutTemplateScore
} from "@/services/workouts/recommendation";

type RawTemplateExercise = {
  id: string;
  exercise_order: number;
  exercise_name: string;
  sets: string | null;
  reps: string | null;
};

type RawTemplateDay = {
  id: string;
  day_index: number;
  day_title: string;
  workout_template_exercises?: RawTemplateExercise[] | null;
};

type RawTemplate = WorkoutTemplateCandidate & {
  workout_template_days?: RawTemplateDay[] | null;
};

type OnboardingRequest = {
  answers?: {
    age_range?: string;
    gender?: string;
    height_cm?: number | string;
    weight_kg?: number | string;
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

const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function firstNumber(value: string | null | undefined, fallback = 3) {
  const match = value?.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : fallback;
}

function normalizeTemplate(template: RawTemplate): RawTemplate {
  return {
    ...template,
    equipment_required: template.equipment_required ?? [],
    workout_template_days: (template.workout_template_days ?? [])
      .map((day) => ({
        ...day,
        workout_template_exercises: [...(day.workout_template_exercises ?? [])].sort((a, b) => a.exercise_order - b.exercise_order)
      }))
      .sort((a, b) => a.day_index - b.day_index)
  };
}

function spreadWeekdays(count: number) {
  const safeCount = Math.max(1, Math.min(7, count));
  return Array.from({ length: safeCount }, (_, index) => weekDays[Math.floor((index * 7) / safeCount)]);
}

function compactPlanSummary(plan: { id: string; name: string }, recommendation: WorkoutTemplateScore, template: RawTemplate) {
  return {
    id: plan.id,
    title: template.title,
    matchScore: recommendation.score,
    explanation: recommendation.explanation,
    goal: template.main_goal,
    trainingCycle: template.workout_type,
    level: template.training_level,
    durationWeeks: template.program_duration_weeks,
    daysPerWeek: template.days_per_week,
    duration: template.time_per_workout,
    equipment: template.equipment_required ?? []
  };
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Please sign in before generating workout plans." }, { status: 401 });
  }

  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as OnboardingRequest;
  const answers = body.answers ?? {};
  const userId = authData.user.id;
  const trainingPlace = cleanString(answers.training_place, "Gym");
  const goals = cleanStringList(answers.goals, [cleanString(answers.main_goal ?? answers.goal, "General wellness")]);
  const mainGoal = goals[0] ?? "General wellness";
  const trainingCycle = cleanString(answers.training_cycle, "Full Body");
  const trainingLevel = cleanString(answers.training_level, "Beginner");
  const daysPerWeek = Math.max(1, Math.min(7, cleanNumber(answers.days_per_week ?? answers.training_days_per_week, 3)));
  const workoutTimeMinutes = Math.max(10, cleanNumber(answers.workout_time_minutes ?? answers.workout_duration_minutes, 45));
  const minWorkoutDuration = Math.max(10, cleanNumber(answers.min_workout_duration_minutes, workoutTimeMinutes));
  const maxWorkoutDuration = Math.max(minWorkoutDuration, cleanNumber(answers.max_workout_duration_minutes, workoutTimeMinutes));
  const desiredDurationWeeks = Math.max(0, cleanNumber(answers.desired_duration_weeks, 0));
  const gender = cleanString(answers.gender, "Prefer not to say");
  const heightCm = cleanNumber(answers.height_cm, 175);
  const weightKg = cleanNumber(answers.weight_kg, 75);
  const availableEquipment = cleanEquipment(answers.available_equipment, trainingPlace);

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

  let { data: onboarding, error: onboardingError } = await supabase
    .from("user_onboarding")
    .upsert(onboardingPayload, { onConflict: "user_id" })
    .select("id")
    .single();

  if (onboardingError) {
    const { goals: _goals, training_cycle: _trainingCycle, min_workout_duration_minutes: _minDuration, max_workout_duration_minutes: _maxDuration, height_cm: _height, weight_kg: _weight, ...compatibleOnboarding } = onboardingPayload;
    const compatible = await supabase
      .from("user_onboarding")
      .upsert(compatibleOnboarding, { onConflict: "user_id" })
      .select("id")
      .single();
    onboarding = compatible.data;
    onboardingError = compatible.error;
  }

  if (onboardingError || !onboarding) {
    return NextResponse.json({ error: onboardingError?.message ?? "Could not save onboarding." }, { status: 400 });
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
    desired_duration_weeks: desiredDurationWeeks || null,
    available_equipment: availableEquipment,
    nutrition_preferences: Array.isArray(answers.nutrition_preferences) ? answers.nutrition_preferences : [],
    allergies_limitations: answers.allergies_limitations ?? null
  };

  const savedAnswers = await supabase.from("onboarding_answers").upsert(onboardingAnswersPayload, { onConflict: "user_id" });
  if (savedAnswers.error) {
    const {
      available_equipment: _availableEquipment,
      desired_duration_weeks: _desiredDurationWeeks,
      goals: _goals,
      training_cycle: _trainingCycle,
      min_workout_duration_minutes: _minDuration,
      max_workout_duration_minutes: _maxDuration,
      ...compatiblePayload
    } = onboardingAnswersPayload;
    await supabase.from("onboarding_answers").upsert(compatiblePayload, { onConflict: "user_id" });
  }

  const { data: templatesData, error: templatesError } = await supabase
    .from("workout_templates")
    .select(
      "id,title,main_goal,workout_type,training_level,program_duration_weeks,days_per_week,time_per_workout,equipment_required,target_gender,workout_template_days(id,day_index,day_title,workout_template_exercises(id,exercise_order,exercise_name,sets,reps))"
    )
    .limit(1000);

  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 400 });
  }

  const templates = ((templatesData ?? []) as RawTemplate[]).map(normalizeTemplate);
  const recommendationInput: WorkoutRecommendationInput = {
    mainGoal,
    goals,
    trainingCycle,
    trainingLevel,
    daysPerWeek,
    workoutTimeMinutes,
    minWorkoutDurationMinutes: minWorkoutDuration,
    maxWorkoutDurationMinutes: maxWorkoutDuration,
    availableEquipment,
    gender,
    ageRange: onboardingAnswersPayload.age_range,
    heightCm,
    weightKg,
    desiredDurationWeeks: desiredDurationWeeks || null
  };
  const recommendations = recommendWorkoutTemplates(templates, recommendationInput)
    .filter((recommendation) => recommendation.score > 0 && (recommendation.template as RawTemplate).workout_template_days?.length)
    .slice(0, 24);

  if (!recommendations.length) {
    return NextResponse.json({ error: "No safe workout templates were found for your answers." }, { status: 404 });
  }

  await supabase
    .from("user_workout_plans")
    .update({ is_active: false, is_default: false })
    .eq("user_id", userId)
    .eq("source", "template_recommendation");

  const createdPlans = [];

  for (const recommendation of recommendations) {
    const template = normalizeTemplate(recommendation.template as RawTemplate);
    const templateDays = (template.workout_template_days ?? []).slice(0, Math.max(1, Math.min(template.workout_template_days?.length ?? 1, template.days_per_week || daysPerWeek)));
    if (!templateDays.length) continue;

    const { data: plan, error: planError } = await supabase
      .from("user_workout_plans")
      .insert({
        user_id: userId,
        name: template.title,
        is_active: false,
        is_default: false,
        template_id: template.id,
        source: "template_recommendation",
        match_score: recommendation.score,
        match_explanation: recommendation.explanation,
        match_reasons: recommendation.reasons,
        generated_from_onboarding_id: onboarding.id,
        program_duration_weeks: desiredDurationWeeks || template.program_duration_weeks,
        days_per_week: template.days_per_week
      })
      .select("id,name")
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: planError?.message ?? "Could not save a generated plan." }, { status: 400 });
    }

    const weekdaySpread = spreadWeekdays(templateDays.length);
    const planDaysPayload = templateDays.map((day, index) => ({
      plan_id: plan.id,
      day_number: day.day_index,
      day_name: day.day_title,
      weekday: weekdaySpread[index],
      notes: template.title
    }));

    const { data: savedDays, error: dayError } = await supabase
      .from("user_workout_plan_days")
      .insert(planDaysPayload)
      .select("id,day_number");

    if (dayError) {
      return NextResponse.json({ error: dayError.message }, { status: 400 });
    }

    const planDayByTemplateIndex = new Map<number, string>();
    (savedDays ?? []).forEach((day) => planDayByTemplateIndex.set(Number(day.day_number), day.id));

    const planExercises = templateDays.flatMap((day) => {
      const planDayId = planDayByTemplateIndex.get(day.day_index);
      if (!planDayId) return [];
      return (day.workout_template_exercises ?? []).map((exercise) => ({
        plan_day_id: planDayId,
        workout_id: null,
        source_workout_id: exercise.id,
        exercise_name: exercise.exercise_name,
        category: template.main_goal,
        target_muscle: day.day_title,
        equipment: (template.equipment_required ?? []).join(", ") || "Varies",
        sets: firstNumber(exercise.sets, 3),
        reps: exercise.reps || "8-12",
        rest_seconds: null,
        instructions: null,
        exercise_url: null,
        video_url: null,
        custom_video_url: null,
        sort_order: exercise.exercise_order,
        notes: exercise.sets && !/^\d+$/.test(exercise.sets) ? `Sets: ${exercise.sets}` : null
      }));
    });

    if (planExercises.length) {
      let { error: exerciseError } = await supabase.from("user_workout_plan_exercises").insert(planExercises);
      if (exerciseError && exerciseError.message.toLowerCase().includes("exercise_url")) {
        const compatibleRows = planExercises.map(({ exercise_url: _exerciseUrl, custom_video_url: _customVideoUrl, ...row }) => row);
        const compatible = await supabase.from("user_workout_plan_exercises").insert(compatibleRows);
        exerciseError = compatible.error;
      }
      if (exerciseError) {
        return NextResponse.json({ error: exerciseError.message }, { status: 400 });
      }
    }

    createdPlans.push(compactPlanSummary(plan, recommendation, template));
  }

  return NextResponse.json({
    plans: createdPlans,
    plan: createdPlans[0] ?? null
  });
}
