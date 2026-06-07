import { generateCardioBlock } from "@/lib/workouts/cardio-generator";
import { generateCooldownBlock } from "@/lib/workouts/cooldown-generator";
import { type CleanExercise, selectStrengthExercises } from "@/lib/workouts/exercise-selection";
import {
  type GeneratorInput,
  type PlanBlock,
  type PlanDay,
  normalizeExperience,
  normalizeGoal,
  normalizeTrainingDays,
  planExplanation,
  splitForDays,
  spreadWeekdays
} from "@/lib/workouts/generator-rules";
import { generateWarmupBlock } from "@/lib/workouts/warmup-generator";

export type GeneratedRulePlan = {
  name: string;
  goal: ReturnType<typeof normalizeGoal>;
  experience: ReturnType<typeof normalizeExperience>;
  daysPerWeek: number;
  durationWeeks: number;
  explanation: string;
  reasons: string[];
  days: PlanDay[];
};

export function generateWorkoutPlan(input: GeneratorInput, exercises: CleanExercise[]): GeneratedRulePlan {
  const goal = normalizeGoal(input);
  const experience = normalizeExperience(input.trainingLevel);
  const daysPerWeek = normalizeTrainingDays(input.daysPerWeek);
  const split = splitForDays(daysPerWeek);
  const weekdays = spreadWeekdays(split.length);

  if (exercises.length < Math.max(12, split.length * 3)) {
    throw new Error("Not enough active exercises are available. Import more exercises from wger before generating plans.");
  }

  const days = split.map((focus, dayIndex) => {
    const strengthItems = selectStrengthExercises(exercises, input, focus);
    if (strengthItems.length < 3) {
      throw new Error(`Not enough active exercises matched ${focus}. Import more exercises for the user's equipment and level.`);
    }
    const strengthBlock: PlanBlock = {
      blockType: "strength",
      title: `${focus} strength`,
      instructions: "Use controlled reps, stop before technical breakdown, and keep progression rule-based.",
      durationMinutes: Math.max(20, Math.min(55, input.workoutTimeMinutes - 15)),
      sortOrder: 2,
      items: strengthItems
    };

    return {
      dayNumber: dayIndex + 1,
      dayName: focus,
      weekday: weekdays[dayIndex],
      focus,
      blocks: [
        generateWarmupBlock({ focus, goal, experience, firstStrength: strengthItems[0] }),
        strengthBlock,
        generateCardioBlock({ goal, experience, dayIndex, totalDays: split.length, focus }),
        generateCooldownBlock(focus)
      ]
    };
  });

  return {
    name: `Full ${daysPerWeek}-day ${goal.replace("_", " ")} plan`,
    goal,
    experience,
    daysPerWeek,
    durationWeeks: Math.max(1, Math.min(16, input.desiredDurationWeeks || 4)),
    explanation: planExplanation(goal, experience, daysPerWeek),
    reasons: [
      "Uses active Supabase exercises",
      "Includes warm-up, strength, cardio, and cool-down blocks",
      "Balances movement patterns across the week",
      "Avoids advanced selections for beginners"
    ],
    days
  };
}
