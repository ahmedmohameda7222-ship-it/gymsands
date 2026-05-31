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
  ageRange?: string | null;
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
  const userAgeBucket = ageBucket(input.ageRange);

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
