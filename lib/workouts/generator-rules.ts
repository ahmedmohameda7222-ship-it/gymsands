export type WorkoutGoal = "muscle_gain" | "fat_loss" | "strength" | "general_fitness";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type BlockType = "warmup" | "strength" | "cardio" | "cooldown";

export type PlanExerciseItem = {
  exerciseId?: string | null;
  name: string;
  sets?: number | null;
  reps?: string | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  restSeconds?: number | null;
  intensity?: string | null;
  notes?: string | null;
  sortOrder: number;
  primaryMuscle?: string | null;
  equipment?: string[] | null;
  instructions?: string | null;
};

export type PlanBlock = {
  blockType: BlockType;
  title: string;
  instructions?: string | null;
  durationMinutes?: number | null;
  sortOrder: number;
  items: PlanExerciseItem[];
};

export type PlanDay = {
  dayNumber: number;
  dayName: string;
  weekday: string;
  focus: string;
  blocks: PlanBlock[];
};

export type GeneratorInput = {
  mainGoal: string;
  goals: string[];
  trainingLevel: string;
  daysPerWeek: number;
  workoutTimeMinutes: number;
  minWorkoutDurationMinutes?: number | null;
  maxWorkoutDurationMinutes?: number | null;
  desiredDurationWeeks?: number | null;
  availableEquipment: string[];
  limitations?: string | null;
};

export const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeGoal(input: Pick<GeneratorInput, "mainGoal" | "goals">): WorkoutGoal {
  const text = normalize([input.mainGoal, ...input.goals].join(" "));
  if (text.includes("fat") || text.includes("lose") || text.includes("weight loss")) return "fat_loss";
  if (text.includes("strength")) return "strength";
  if (text.includes("muscle") || text.includes("mass") || text.includes("build")) return "muscle_gain";
  return "general_fitness";
}

export function normalizeExperience(value: string): ExperienceLevel {
  const text = normalize(value);
  if (text.includes("advanced")) return "advanced";
  if (text.includes("intermediate")) return "intermediate";
  return "beginner";
}

export function normalizeTrainingDays(value: number) {
  return Math.min(6, Math.max(2, Math.round(value || 3)));
}

export function spreadWeekdays(count: number) {
  const safeCount = Math.max(1, Math.min(7, count));
  return Array.from({ length: safeCount }, (_, index) => weekDays[Math.floor((index * 7) / safeCount)]);
}

export function splitForDays(daysPerWeek: number) {
  const days = normalizeTrainingDays(daysPerWeek);
  if (days === 2) return ["Full Body A", "Full Body B"];
  if (days === 3) return ["Full Body A", "Full Body B", "Full Body C"];
  if (days === 4) return ["Upper A", "Lower A", "Upper B", "Lower B"];
  if (days === 5) return ["Push", "Pull", "Legs", "Upper", "Lower"];
  return ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"];
}

export function strengthPrescription(goal: WorkoutGoal, compound: boolean, experience: ExperienceLevel) {
  if (goal === "strength") {
    return compound
      ? { sets: experience === "advanced" ? 5 : 4, reps: "3-6", restSeconds: 180 }
      : { sets: 3, reps: "8-12", restSeconds: 105 };
  }
  if (goal === "muscle_gain") {
    return compound
      ? { sets: experience === "beginner" ? 3 : 4, reps: "6-12", restSeconds: 120 }
      : { sets: 3, reps: "10-15", restSeconds: 75 };
  }
  return { sets: experience === "beginner" ? 2 : 3, reps: "10-15", restSeconds: 60 };
}

export function targetExerciseCount(experience: ExperienceLevel, focus: string) {
  if (focus.toLowerCase().includes("full body")) return experience === "beginner" ? 5 : 6;
  if (experience === "beginner") return 4;
  return experience === "advanced" ? 6 : 5;
}

export function dayRequirements(focus: string) {
  const lower = focus.toLowerCase();
  if (lower.includes("push")) {
    return [
      { label: "Horizontal push", pattern: "horizontal_push", muscle: "chest", compound: true },
      { label: "Vertical push", pattern: "vertical_push", muscle: "shoulders", compound: true },
      { label: "Chest accessory", pattern: "push", muscle: "chest", compound: false },
      { label: "Lateral delt", pattern: "isolation", muscle: "shoulders", compound: false },
      { label: "Triceps", pattern: "isolation", muscle: "triceps", compound: false }
    ];
  }
  if (lower.includes("pull")) {
    return [
      { label: "Vertical pull", pattern: "vertical_pull", muscle: "back", compound: true },
      { label: "Horizontal pull", pattern: "horizontal_pull", muscle: "back", compound: true },
      { label: "Rear delt", pattern: "isolation", muscle: "shoulders", compound: false },
      { label: "Biceps", pattern: "isolation", muscle: "biceps", compound: false },
      { label: "Core", pattern: "core", muscle: "core", compound: false }
    ];
  }
  if (lower.includes("leg") || lower.includes("lower")) {
    return [
      { label: "Squat pattern", pattern: "squat", muscle: "quads", compound: true },
      { label: "Hinge pattern", pattern: "hinge", muscle: "hamstrings", compound: true },
      { label: "Quad accessory", pattern: "knee_dominant", muscle: "quads", compound: false },
      { label: "Hamstring accessory", pattern: "hip_dominant", muscle: "hamstrings", compound: false },
      { label: "Calves", pattern: "isolation", muscle: "calves", compound: false },
      { label: "Core", pattern: "core", muscle: "core", compound: false }
    ];
  }
  if (lower.includes("upper")) {
    return [
      { label: "Chest press", pattern: "horizontal_push", muscle: "chest", compound: true },
      { label: "Back pull", pattern: "horizontal_pull", muscle: "back", compound: true },
      { label: "Shoulder press", pattern: "vertical_push", muscle: "shoulders", compound: true },
      { label: "Biceps", pattern: "isolation", muscle: "biceps", compound: false },
      { label: "Triceps", pattern: "isolation", muscle: "triceps", compound: false }
    ];
  }
  return [
    { label: "Squat or leg press", pattern: "squat", muscle: "quads", compound: true },
    { label: "Push", pattern: "push", muscle: "chest", compound: true },
    { label: "Pull", pattern: "pull", muscle: "back", compound: true },
    { label: "Hinge", pattern: "hinge", muscle: "hamstrings", compound: true },
    { label: "Core", pattern: "core", muscle: "core", compound: false }
  ];
}

export function planExplanation(goal: WorkoutGoal, experience: ExperienceLevel, daysPerWeek: number) {
  const goalLabel = goal.replace("_", " ");
  return `Built from your onboarding profile: ${goalLabel}, ${experience}, ${daysPerWeek} training days, available equipment, and active exercise data. Each day includes warm-up, strength, cardio, and cool-down blocks.`;
}
