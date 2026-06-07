import {
  type ExperienceLevel,
  type GeneratorInput,
  type PlanExerciseItem,
  dayRequirements,
  normalizeExperience,
  normalizeGoal,
  strengthPrescription,
  targetExerciseCount
} from "@/lib/workouts/generator-rules";

export type CleanExercise = {
  id: string;
  name: string;
  primary_muscle: string | null;
  secondary_muscles: string[];
  equipment: string[];
  difficulty: string | null;
  mechanics: string | null;
  movement_pattern: string | null;
  force_type: string | null;
  instructions: string | null;
};

type Requirement = ReturnType<typeof dayRequirements>[number];

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function exerciseText(exercise: CleanExercise) {
  return normalize([
    exercise.name,
    exercise.primary_muscle,
    exercise.mechanics,
    exercise.movement_pattern,
    exercise.force_type,
    ...exercise.secondary_muscles,
    ...exercise.equipment
  ].join(" "));
}

function equipmentAllowed(exercise: CleanExercise, availableEquipment: string[]) {
  const available = availableEquipment.map(normalize);
  if (!available.length || available.some((item) => item.includes("full gym") || item === "gym")) return true;
  if (!exercise.equipment.length) return true;
  const exerciseEquipment = exercise.equipment.map(normalize);
  if (available.some((item) => item.includes("home"))) {
    available.push("bodyweight", "dumbbell", "band");
  }
  return exerciseEquipment.some((item) => available.some((availableItem) => item.includes(availableItem) || availableItem.includes(item)));
}

function difficultyAllowed(exercise: CleanExercise, experience: ExperienceLevel) {
  const difficulty = normalize(exercise.difficulty);
  if (experience === "beginner") return !difficulty.includes("advanced");
  if (experience === "intermediate") return !difficulty.includes("advanced") || difficulty.includes("intermediate");
  return true;
}

function matchesLimitation(exercise: CleanExercise, limitations?: string | null) {
  const text = normalize(limitations);
  if (!text) return false;
  const exerciseName = normalize(exercise.name);
  if (text.includes("knee") && /(jump|lunge|pistol|sprint)/.test(exerciseName)) return true;
  if (text.includes("shoulder") && /(behind neck|snatch|upright row)/.test(exerciseName)) return true;
  if (text.includes("back") && /(good morning|max|heavy)/.test(exerciseName)) return true;
  return false;
}

function scoreExercise(exercise: CleanExercise, requirement: Requirement, input: GeneratorInput) {
  const text = exerciseText(exercise);
  let score = 0;
  if (text.includes(normalize(requirement.muscle))) score += 35;
  if (text.includes(normalize(requirement.pattern))) score += 24;
  if (requirement.pattern.includes("push") && /(press|push|chest)/.test(text)) score += 18;
  if (requirement.pattern.includes("pull") && /(row|pull|lat|back)/.test(text)) score += 18;
  if (requirement.pattern === "squat" && /(squat|leg press|quad)/.test(text)) score += 20;
  if (requirement.pattern === "hinge" && /(deadlift|hinge|hamstring|glute)/.test(text)) score += 20;
  if (requirement.pattern === "core" && /(plank|crunch|core|ab)/.test(text)) score += 20;
  if (equipmentAllowed(exercise, input.availableEquipment)) score += 12;
  if (exercise.instructions) score += 4;
  if (matchesLimitation(exercise, input.limitations)) score -= 80;
  return score;
}

export function selectStrengthExercises(exercises: CleanExercise[], input: GeneratorInput, focus: string) {
  const goal = normalizeGoal(input);
  const experience = normalizeExperience(input.trainingLevel);
  const allowed = exercises.filter(
    (exercise) =>
      equipmentAllowed(exercise, input.availableEquipment) &&
      difficultyAllowed(exercise, experience) &&
      !matchesLimitation(exercise, input.limitations)
  );
  const pool = allowed.length >= 8 ? allowed : exercises.filter((exercise) => difficultyAllowed(exercise, experience));
  const used = new Set<string>();
  const count = targetExerciseCount(experience, focus);
  const requirements = dayRequirements(focus).slice(0, count);
  const selected: PlanExerciseItem[] = [];

  requirements.forEach((requirement, index) => {
    const ranked = pool
      .filter((exercise) => !used.has(exercise.id))
      .map((exercise) => ({ exercise, score: scoreExercise(exercise, requirement, input) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.exercise;
    if (!best || ranked[0].score < 5) return;
    used.add(best.id);
    const prescription = strengthPrescription(goal, requirement.compound, experience);
    selected.push({
      exerciseId: best.id,
      name: best.name,
      sets: prescription.sets,
      reps: prescription.reps,
      restSeconds: prescription.restSeconds,
      intensity: requirement.compound ? "controlled working sets" : "smooth accessory work",
      notes: requirement.label,
      sortOrder: index + 1,
      primaryMuscle: best.primary_muscle,
      equipment: best.equipment,
      instructions: best.instructions
    });
  });

  return selected;
}
