import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { recommendWorkoutTemplate, type WorkoutRecommendationInput, type WorkoutTemplateCandidate } from "@/services/workouts/recommendation";

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
    height_cm?: number;
    weight_kg?: number;
    goal?: string;
    main_goal?: string;
    training_level?: string;
    training_place?: string;
    training_days_per_week?: number;
    days_per_week?: number;
    workout_duration_minutes?: number;
    workout_time_minutes?: number;
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

function cleanEquipment(values: unknown, trainingPlace: string) {
  const selected = Array.isArray(values)
    ? values.map((item) => cleanString(item, "")).filter(Boolean)
    : [];

  if (selected.length) return selected;
  if (trainingPlace === "Home") return ["Bodyweight", "Dumbbells", "Bands", "Home"];
  if (trainingPlace === "Both") return ["Full gym", "Bodyweight", "Dumbbells", "Bands"];
  return ["Full gym"];
}

function firstNumber(value: string | null | undefined, fallback = 3) {
  const match = value?.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : fallback;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function spreadOffsets(count: number) {
  const safeCount = Math.max(1, Math.min(7, count));
  if (safeCount === 1) return [0];
  return Array.from({ length: safeCount }, (_, index) => Math.floor((index * 7) / safeCount));
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

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Please sign in before generating a workout plan." }, { status: 401 });
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
  const mainGoal = cleanString(answers.main_goal ?? answers.goal, "General Fitness");
  const trainingLevel = cleanString(answers.training_level, "Beginner");
  const daysPerWeek = Math.max(1, Math.min(7, cleanNumber(answers.days_per_week ?? answers.training_days_per_week, 3)));
  const workoutTimeMinutes = Math.max(10, cleanNumber(answers.workout_time_minutes ?? answers.workout_duration_minutes, 45));
  const gender = cleanString(answers.gender, "Prefer not to say");
  const availableEquipment = cleanEquipment(answers.available_equipment, trainingPlace);

  const onboardingPayload = {
    user_id: userId,
    main_goal: mainGoal,
    training_level: trainingLevel,
    days_per_week: daysPerWeek,
    workout_time_minutes: workoutTimeMinutes,
    available_equipment: availableEquipment,
    gender,
    onboarding_answers: answers
  };

  const { data: onboarding, error: onboardingError } = await supabase
    .from("user_onboarding")
    .upsert(onboardingPayload, { onConflict: "user_id" })
    .select("id")
    .single();

  if (onboardingError) {
    return NextResponse.json({ error: onboardingError.message }, { status: 400 });
  }

  const onboardingAnswersPayload = {
    user_id: userId,
    age_range: cleanString(answers.age_range, "25-34"),
    gender,
    height_cm: cleanNumber(answers.height_cm, 175),
    weight_kg: cleanNumber(answers.weight_kg, 75),
    goal: mainGoal,
    training_level: trainingLevel,
    training_place: trainingPlace,
    training_days_per_week: daysPerWeek,
    workout_duration_minutes: workoutTimeMinutes,
    available_equipment: availableEquipment,
    nutrition_preferences: Array.isArray(answers.nutrition_preferences) ? answers.nutrition_preferences : [],
    allergies_limitations: answers.allergies_limitations ?? null
  };

  const savedAnswers = await supabase.from("onboarding_answers").upsert(onboardingAnswersPayload, { onConflict: "user_id" });
  if (savedAnswers.error && savedAnswers.error.message.toLowerCase().includes("available_equipment")) {
    const { available_equipment: _availableEquipment, ...compatiblePayload } = onboardingAnswersPayload;
    await supabase.from("onboarding_answers").upsert(compatiblePayload, { onConflict: "user_id" });
  }

  const { data: templatesData, error: templatesError } = await supabase
    .from("workout_templates")
    .select("id,title,main_goal,workout_type,training_level,program_duration_weeks,days_per_week,time_per_workout,equipment_required,target_gender")
    .limit(1000);

  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 400 });
  }

  const templates = (templatesData ?? []) as RawTemplate[];
  const recommendationInput: WorkoutRecommendationInput = {
    mainGoal,
    trainingLevel,
    daysPerWeek,
    workoutTimeMinutes,
    availableEquipment,
    gender
  };
  const recommendation = recommendWorkoutTemplate(templates, recommendationInput);

  if (!recommendation) {
    return NextResponse.json({ error: "No safe workout template was found for your answers." }, { status: 404 });
  }

  const { data: selectedTemplateData, error: selectedTemplateError } = await supabase
    .from("workout_templates")
    .select(
      "id,title,main_goal,workout_type,training_level,program_duration_weeks,days_per_week,time_per_workout,equipment_required,target_gender,workout_template_days(id,day_index,day_title,workout_template_exercises(id,exercise_order,exercise_name,sets,reps))"
    )
    .eq("id", recommendation.template.id)
    .single();

  if (selectedTemplateError) {
    return NextResponse.json({ error: selectedTemplateError.message }, { status: 400 });
  }

  const template = normalizeTemplate(selectedTemplateData as RawTemplate);
  const templateDays = (template.workout_template_days ?? []).slice(0, Math.max(1, Math.min(template.workout_template_days?.length ?? 1, template.days_per_week || daysPerWeek)));
  if (!templateDays.length) {
    return NextResponse.json({ error: "The selected workout template has no workout days." }, { status: 400 });
  }

  const deactivate = await supabase.from("user_workout_plans").update({ is_active: false }).eq("user_id", userId).eq("is_active", true);
  if (deactivate.error) {
    return NextResponse.json({ error: deactivate.error.message }, { status: 400 });
  }

  const { data: plan, error: planError } = await supabase
    .from("user_workout_plans")
    .insert({
      user_id: userId,
      name: template.title,
      is_active: true,
      template_id: template.id,
      source: "template_recommendation",
      match_score: recommendation.score,
      match_explanation: recommendation.explanation,
      match_reasons: recommendation.reasons,
      generated_from_onboarding_id: onboarding.id,
      program_duration_weeks: template.program_duration_weeks,
      days_per_week: template.days_per_week
    })
    .select("id,name")
    .single();

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 400 });
  }

  const firstWeekOffsets = spreadOffsets(templateDays.length);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const planDaysPayload = templateDays.map((day, index) => {
    const firstDate = addDays(today, firstWeekOffsets[index] ?? index);
    return {
      plan_id: plan.id,
      day_number: day.day_index,
      day_name: day.day_title,
      weekday: weekDays[firstDate.getDay()],
      notes: template.title
    };
  });

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
      video_url: null,
      sort_order: exercise.exercise_order,
      notes: exercise.sets && !/^\d+$/.test(exercise.sets) ? `Sets: ${exercise.sets}` : null
    }));
  });

  if (planExercises.length) {
    const { error: exerciseError } = await supabase.from("user_workout_plan_exercises").insert(planExercises);
    if (exerciseError) {
      return NextResponse.json({ error: exerciseError.message }, { status: 400 });
    }
  }

  const sessionRows = [];
  let sessionNumber = 1;
  for (let weekIndex = 1; weekIndex <= template.program_duration_weeks; weekIndex += 1) {
    for (let index = 0; index < templateDays.length; index += 1) {
      const day = templateDays[index];
      const scheduledDate = addDays(today, (weekIndex - 1) * 7 + (firstWeekOffsets[index] ?? index));
      sessionRows.push({
        user_id: userId,
        user_workout_plan_id: plan.id,
        workout_template_day_id: day.id,
        plan_day_id: planDayByTemplateIndex.get(day.day_index) ?? null,
        week_index: weekIndex,
        day_index: day.day_index,
        session_number: sessionNumber,
        scheduled_date: toDateOnly(scheduledDate),
        day_title: day.day_title,
        status: "scheduled"
      });
      sessionNumber += 1;
    }
  }

  const { error: sessionsError } = await supabase.from("user_workout_sessions").insert(sessionRows);
  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 400 });
  }

  return NextResponse.json({
    plan: {
      id: plan.id,
      title: template.title,
      matchScore: recommendation.score,
      explanation: recommendation.explanation,
      goal: template.main_goal,
      level: template.training_level,
      durationWeeks: template.program_duration_weeks,
      daysPerWeek: template.days_per_week,
      equipment: template.equipment_required ?? [],
      sessionsCreated: sessionRows.length
    }
  });
}
