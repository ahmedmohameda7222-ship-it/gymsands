export type WorkoutTemplateCandidate = {
  id: string;
  title: string;
  main_goal: string;
  workout_type: string | null;
  training_level: string;
  program_duration_weeks: number;
  days_per_week: number;
  time_per_workout: string | null;
  equipment_required: string[] | null;
  target_gender: string | null;
};

export type WorkoutRecommendationInput = {
  mainGoal: string;
  goals?: string[];
  trainingCycle?: string | null;
  trainingLevel: string;
  daysPerWeek: number;
  workoutTimeMinutes?: number | null;
  minWorkoutDurationMinutes?: number | null;
  maxWorkoutDurationMinutes?: number | null;
  availableEquipment: string[];
  gender: string;
  ageRange?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  desiredDurationWeeks?: number | null;
};

export type WorkoutTemplateScore = {
  template: WorkoutTemplateCandidate;
  score: number;
  reasons: string[];
  explanation: string;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalGoal(value: string) {
  const normalized = normalize(value);
  if (normalized.includes("wellness") || normalized.includes("health") || normalized.includes("stress") || normalized.includes("mobility")) return "general fitness";
  if (normalized.includes("build") || normalized.includes("muscle") || normalized.includes("mass")) return "build muscle";
  if (normalized.includes("lose") || normalized.includes("fat") || normalized.includes("cut")) return "lose fat";
  if (normalized.includes("strength")) return "increase strength";
  if (normalized.includes("endurance") || normalized.includes("cardio")) return "sports performance";
  if (normalized.includes("recomposition")) return "build muscle";
  if (normalized.includes("sport")) return "sports performance";
  return "general fitness";
}

function normalizeLevel(value: string) {
  const normalized = normalize(value);
  if (normalized.includes("advanced")) return "advanced";
  if (normalized.includes("intermediate")) return "intermediate";
  return "beginner";
}

function normalizeGender(value: string | null | undefined) {
  const normalized = normalize(value);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  if ((tokens.has("male") && tokens.has("female")) || normalized.includes("male and female")) return "male and female";
  if (tokens.has("female")) return "female";
  if (tokens.has("male")) return "male";
  return "male and female";
}

function ageBucket(value: string | null | undefined) {
  const normalized = normalize(value);
  const firstNumber = normalized.match(/\d+/)?.[0];
  const age = firstNumber ? Number(firstNumber) : 30;
  if (age >= 45) return "45+";
  if (age >= 35) return "35-44";
  if (age >= 25) return "25-34";
  return "18-24";
}

function equipmentSet(values: string[] | null | undefined) {
  return new Set((values ?? []).map(normalize).filter(Boolean));
}

function isSafeLevel(userLevel: string, templateLevel: string) {
  return !(normalizeLevel(userLevel) === "beginner" && normalizeLevel(templateLevel) === "advanced");
}

function equipmentScore(required: string[] | null | undefined, available: string[]) {
  const requiredSet = equipmentSet(required);
  if (!requiredSet.size) return { score: 10, matched: [] as string[] };

  const availableSet = equipmentSet(available);
  const broadGymEquipment = ["barbell", "bodyweight", "cables", "dumbbells", "ez bar", "machines", "kettle bells", "medicine ball", "exercise ball", "bands", "other"];
  if (availableSet.has("full gym") || availableSet.has("gym")) {
    broadGymEquipment.forEach((item) => availableSet.add(item));
  }
  if (availableSet.has("home")) availableSet.add("bodyweight");

  const matched = Array.from(requiredSet).filter((item) => availableSet.has(item));
  return {
    score: Math.round((matched.length / requiredSet.size) * 20),
    matched
  };
}

function durationMinutes(value: string | null | undefined) {
  const numbers = value?.match(/\d+/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, item) => sum + item, 0) / numbers.length);
}

function matchesTrainingCycle(templateType: string | null | undefined, selectedCycle: string | null | undefined) {
  if (!selectedCycle) return false;
  const template = normalize(templateType);
  const cycle = normalize(selectedCycle);
  if (!template || !cycle) return false;
  if (template.includes(cycle) || cycle.includes(template)) return true;
  if (cycle.includes("upper lower") && (template.includes("upper") || template.includes("lower"))) return true;
  if (cycle.includes("push pull legs") && (template.includes("ppl") || template.includes("push") || template.includes("pull"))) return true;
  if (cycle.includes("wellness") && (template.includes("mobility") || template.includes("full body"))) return true;
  if (cycle.includes("cardio strength") && (template.includes("cardio") || template.includes("strength"))) return true;
  return false;
}

function goalLabel(value: string) {
  const canonical = canonicalGoal(value);
  if (canonical === "build muscle") return "Build Muscle";
  if (canonical === "lose fat") return "Lose Fat";
  if (canonical === "increase strength") return "Increase Strength";
  if (canonical === "sports performance") return "Sports Performance";
  return "General Fitness";
}

export function scoreWorkoutTemplate(template: WorkoutTemplateCandidate, input: WorkoutRecommendationInput): WorkoutTemplateScore | null {
  if (!isSafeLevel(input.trainingLevel, template.training_level)) return null;

  const reasons: string[] = [];
  let score = 0;
  const selectedGoals = input.goals?.length ? input.goals : [input.mainGoal];
  const inputGoals = selectedGoals.map(canonicalGoal);
  const templateGoal = canonicalGoal(template.main_goal);
  const inputLevel = normalizeLevel(input.trainingLevel);
  const templateLevel = normalizeLevel(template.training_level);
  const userAgeBucket = ageBucket(input.ageRange);
  const templateGender = normalizeGender(template.target_gender);
  const userGender = normalizeGender(input.gender);

  if ((userGender === "male" || userGender === "female") && templateGender !== userGender) {
    return null;
  }

  if (inputGoals.includes(templateGoal)) {
    score += 35;
    const matchedGoal = selectedGoals.find((goal) => canonicalGoal(goal) === templateGoal) ?? input.mainGoal;
    reasons.push(`matches your ${goalLabel(matchedGoal).toLowerCase()} goal`);
  } else if (inputGoals.includes("general fitness") && templateGoal !== "sports performance") {
    score += 12;
    reasons.push("supports your broader wellness goals");
  }

  if (templateLevel === inputLevel) {
    score += 30;
    reasons.push(`fits your ${input.trainingLevel.toLowerCase()} level`);
  } else if (inputLevel === "intermediate" && templateLevel === "beginner") {
    reasons.push("keeps the difficulty manageable");
  } else if (inputLevel === "advanced" && templateLevel === "intermediate") {
    reasons.push("uses the closest available training level");
  }

  const dayDifference = Math.abs(Number(template.days_per_week) - Number(input.daysPerWeek));
  if (dayDifference === 0) {
    score += 20;
    reasons.push(`matches ${input.daysPerWeek} days per week`);
  } else if (dayDifference === 1) {
    score += 8;
    reasons.push("is within one training day of your schedule");
  }

  if (templateGender === userGender || templateGender === "male and female" || userGender === "male and female") {
    score += 10;
    reasons.push("fits your profile");
  }

  const equipment = equipmentScore(template.equipment_required, input.availableEquipment);
  score += equipment.score;
  if (equipment.score >= 16) reasons.push("works with most of your available equipment");
  else if (equipment.score > 0) reasons.push("shares some of your available equipment");

  if (matchesTrainingCycle(template.workout_type, input.trainingCycle)) {
    score += 18;
    reasons.push(`matches your ${input.trainingCycle?.toLowerCase()} training cycle`);
  }

  const templateMinutes = durationMinutes(template.time_per_workout);
  const minDuration = input.minWorkoutDurationMinutes ?? input.workoutTimeMinutes ?? null;
  const maxDuration = input.maxWorkoutDurationMinutes ?? input.workoutTimeMinutes ?? null;
  if (templateMinutes && minDuration && maxDuration) {
    if (templateMinutes >= Math.min(minDuration, maxDuration) && templateMinutes <= Math.max(minDuration, maxDuration)) {
      score += 15;
      reasons.push(`fits your ${Math.min(minDuration, maxDuration)}-${Math.max(minDuration, maxDuration)} minute workout window`);
    } else {
      const nearest = Math.min(Math.abs(templateMinutes - minDuration), Math.abs(templateMinutes - maxDuration));
      if (nearest <= 10) {
        score += 5;
        reasons.push("is close to your preferred workout duration");
      }
    }
  }

  if (input.desiredDurationWeeks) {
    const durationDifference = Math.abs(Number(template.program_duration_weeks) - Number(input.desiredDurationWeeks));
    if (durationDifference === 0) {
      score += 12;
      reasons.push(`matches your ${input.desiredDurationWeeks}-week finish target`);
    } else if (durationDifference <= 2) {
      score += 6;
      reasons.push("is close to your target plan duration");
    }
  }

  if ((userAgeBucket === "45+" || userAgeBucket === "35-44") && inputLevel === "beginner") {
    if (templateLevel === "beginner" && template.days_per_week <= Math.max(4, input.daysPerWeek)) {
      score += 8;
      reasons.push("keeps recovery realistic for your age and beginner level");
    } else if (template.days_per_week > input.daysPerWeek + 1) {
      score -= 8;
    }
  } else if ((userAgeBucket === "18-24" || userAgeBucket === "25-34") && inputLevel === "advanced" && templateLevel === "advanced") {
    score += 5;
    reasons.push("supports higher training capacity with your experience level");
  }

  if (input.heightCm && input.weightKg) {
    score += 2;
    reasons.push("uses your height and weight profile in the match");
  }

  const explanation = reasons.length
    ? `Selected because it ${reasons.join(", ")}.`
    : "Selected as the closest safe match from the workout template library.";

  return { template, score, reasons, explanation };
}

export function recommendWorkoutTemplate(templates: WorkoutTemplateCandidate[], input: WorkoutRecommendationInput) {
  return recommendWorkoutTemplates(templates, input)[0] ?? null;
}

export function recommendWorkoutTemplates(templates: WorkoutTemplateCandidate[], input: WorkoutRecommendationInput) {
  return templates
    .map((template) => scoreWorkoutTemplate(template, input))
    .filter((item): item is WorkoutTemplateScore => Boolean(item))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bLevel = normalizeLevel(b.template.training_level) === normalizeLevel(input.trainingLevel) ? 1 : 0;
      const aLevel = normalizeLevel(a.template.training_level) === normalizeLevel(input.trainingLevel) ? 1 : 0;
      if (bLevel !== aLevel) return bLevel - aLevel;
      return Math.abs(b.template.days_per_week - input.daysPerWeek) - Math.abs(a.template.days_per_week - input.daysPerWeek);
    });
}
