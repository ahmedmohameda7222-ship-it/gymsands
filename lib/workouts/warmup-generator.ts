import type { ExperienceLevel, PlanBlock, PlanExerciseItem, WorkoutGoal } from "@/lib/workouts/generator-rules";

function durationForWarmup(experience: ExperienceLevel) {
  if (experience === "beginner") return 9;
  if (experience === "intermediate") return 8;
  return 6;
}

function mobilityForFocus(focus: string) {
  const lower = focus.toLowerCase();
  if (lower.includes("push")) return ["Shoulder circles", "Band pull-aparts"];
  if (lower.includes("pull") || lower.includes("upper")) return ["Cat-cow", "Band pull-aparts", "Thoracic rotations"];
  if (lower.includes("leg") || lower.includes("lower")) return ["Hip circles", "Bodyweight squats", "Glute bridges"];
  return ["Dynamic hip mobility", "Shoulder circles", "Bodyweight squats"];
}

export function generateWarmupBlock({
  focus,
  experience,
  firstStrength
}: {
  focus: string;
  goal: WorkoutGoal;
  experience: ExperienceLevel;
  firstStrength?: PlanExerciseItem | null;
}): PlanBlock {
  const items: PlanExerciseItem[] = [
    {
      name: focus.toLowerCase().includes("leg") ? "Easy bike" : "Incline walk or row",
      durationSeconds: 300,
      intensity: "easy",
      notes: "General warm-up to raise temperature and breathing gradually.",
      sortOrder: 1
    },
    ...mobilityForFocus(focus).map((name, index) => ({
      name,
      sets: 2,
      reps: name.includes("circle") ? "10 each side" : "10-12",
      intensity: "dynamic mobility",
      sortOrder: index + 2
    })),
    ...(firstStrength
      ? [
          {
            name: `${firstStrength.name} ramp-up sets`,
            sets: 2,
            reps: "lighter warm-up sets",
            restSeconds: 60,
            intensity: "light",
            notes: "Do not count these as working sets.",
            sortOrder: 6
          }
        ]
      : [])
  ];

  return {
    blockType: "warmup",
    title: `${focus} warm-up`,
    instructions: "Move smoothly, stay pain-free, and keep ramp-up sets lighter than working sets.",
    durationMinutes: durationForWarmup(experience),
    sortOrder: 1,
    items
  };
}
