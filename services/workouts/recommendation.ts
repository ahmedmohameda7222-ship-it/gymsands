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
  trainingLevel: string;
  daysPerWeek: number;
  workoutTimeMinutes?: number | null;
  availableEquipment: string[];
  gender: string;
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
  if (normalized.includes("build") || normalized.includes("muscle") || normalized.includes("mass")) return "build muscle";
  if (normalized.includes("lose") || normalized.includes("fat") || normalized.includes("cut")) return "lose fat";
  if (normalized.includes("strength")) return "increase strength";
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
  const inputGoal = canonicalGoal(input.mainGoal);
  const templateGoal = canonicalGoal(template.main_goal);
  const inputLevel = normalizeLevel(input.trainingLevel);
  const templateLevel = normalizeLevel(template.training_level);

  if (templateGoal === inputGoal) {
    score += 35;
    reasons.push(`matches your ${goalLabel(input.mainGoal).toLowerCase()} goal`);
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

  const templateGender = normalizeGender(template.target_gender);
  const userGender = normalizeGender(input.gender);
  if (templateGender === userGender || templateGender === "male and female" || userGender === "male and female") {
    score += 10;
    reasons.push("fits your profile");
  }

  const equipment = equipmentScore(template.equipment_required, input.availableEquipment);
  score += equipment.score;
  if (equipment.score >= 16) reasons.push("works with most of your available equipment");
  else if (equipment.score > 0) reasons.push("shares some of your available equipment");

  const explanation = reasons.length
    ? `Selected because it ${reasons.join(", ")}.`
    : "Selected as the closest safe match from the workout template library.";

  return { template, score, reasons, explanation };
}

export function recommendWorkoutTemplate(templates: WorkoutTemplateCandidate[], input: WorkoutRecommendationInput) {
  const scored = templates
    .map((template) => scoreWorkoutTemplate(template, input))
    .filter((item): item is WorkoutTemplateScore => Boolean(item))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bLevel = normalizeLevel(b.template.training_level) === normalizeLevel(input.trainingLevel) ? 1 : 0;
      const aLevel = normalizeLevel(a.template.training_level) === normalizeLevel(input.trainingLevel) ? 1 : 0;
      if (bLevel !== aLevel) return bLevel - aLevel;
      return Math.abs(b.template.days_per_week - input.daysPerWeek) - Math.abs(a.template.days_per_week - input.daysPerWeek);
    });

  return scored[0] ?? null;
}
