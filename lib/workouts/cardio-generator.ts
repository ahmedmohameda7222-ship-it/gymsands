import type { ExperienceLevel, PlanBlock, WorkoutGoal } from "@/lib/workouts/generator-rules";

function cardioTarget(goal: WorkoutGoal, experience: ExperienceLevel) {
  if (goal === "fat_loss") return { sessions: 5, duration: experience === "beginner" ? 25 : experience === "intermediate" ? 35 : 40, intensity: "moderate" };
  if (goal === "general_fitness") return { sessions: 3, duration: experience === "beginner" ? 25 : 30, intensity: "moderate" };
  if (goal === "muscle_gain") return { sessions: 2, duration: 20, intensity: "low" };
  return { sessions: 2, duration: 15, intensity: "low" };
}

export function generateCardioBlock({
  goal,
  experience,
  dayIndex,
  focus
}: {
  goal: WorkoutGoal;
  experience: ExperienceLevel;
  dayIndex: number;
  totalDays: number;
  focus: string;
}): PlanBlock {
  const target = cardioTarget(goal, experience);
  const prescribed = dayIndex < target.sessions;
  const lowerFocus = focus.toLowerCase();
  const mode = lowerFocus.includes("leg") && (goal === "strength" || goal === "muscle_gain") ? "easy walking or cycling" : "incline treadmill, cycling, elliptical, rowing, or walking";
  const duration = prescribed ? target.duration : goal === "fat_loss" ? 20 : 10;

  return {
    blockType: "cardio",
    title: prescribed ? "Cardio" : "Optional recovery cardio",
    instructions:
      goal === "strength"
        ? "Keep cardio easy and avoid intense intervals before heavy lower-body training."
        : "Use a pace you can repeat consistently without replacing strength work.",
    durationMinutes: duration,
    sortOrder: 3,
    items: [
      {
        name: mode,
        durationSeconds: duration * 60,
        intensity: prescribed ? target.intensity : "low optional",
        notes: prescribed ? "Planned weekly cardio dose." : "Optional recovery work; skip if recovery is poor.",
        sortOrder: 1
      }
    ]
  };
}
